import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationPriority, NotificationType, Prisma } from '@prisma/client';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { DiscordService } from './discord.service';
import { NotificationSettingsService } from './notification-settings.service';
import { NotificationsGateway } from './notifications.gateway';
import { PushService } from './push.service';
import { PushSubscribeDto } from './dto/push-subscribe.dto';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message?: string;
  link?: string;
  imageUrl?: string;
  fromUserId?: string;
  metadata?: Prisma.InputJsonValue;
  groupKey?: string;
  priority?: NotificationPriority;
  actionUrl?: string;
  actionLabel?: string;
  /// Сообщения сайта (системные, ADR-0080) доставляются даже при отключённом
  /// типе в настройках пользователя.
  bypassPreferences?: boolean;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: NotificationSettingsService,
    private readonly gateway: NotificationsGateway,
    private readonly email: EmailService,
    private readonly push: PushService,
    private readonly discord: DiscordService,
  ) {}

  /// Единая точка создания уведомления для всех доменных модулей (друзья,
  /// комментарии, активность, личные/чат-сообщения и т.д.). Грубый вкл/выкл
  /// категории (например User.notifyOnComment) проверяется ВЫЗЫВАЮЩИМ
  /// доменным сервисом ДО вызова create — здесь проверяется только точный
  /// per-type рубильник (NotificationSettings.typeSettings), общий для всех
  /// источников одного типа.
  async create(input: CreateNotificationInput) {
    const typeEnabled =
      input.bypassPreferences ||
      (await this.settings.isTypeEnabled(input.userId, input.type));
    if (!typeEnabled) {
      return null;
    }

    const notification = await this.prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        message: input.message,
        link: input.link,
        imageUrl: input.imageUrl,
        fromUserId: input.fromUserId,
        metadata: input.metadata,
        groupKey: input.groupKey,
        priority: input.priority ?? NotificationPriority.NORMAL,
        actionUrl: input.actionUrl,
        actionLabel: input.actionLabel,
      },
    });

    // WS realtime — всегда, это отражение состояния UI, а не канал доставки
    // в смысле email/push/discord (на которые распространяются quiet hours).
    this.gateway.emitToUser(input.userId, notification);
    await this.notifyChanged(input.userId);

    await this.deliver(notification);

    return notification;
  }

  private async deliver(notification: {
    id: string;
    userId: string;
    title: string;
    message: string | null;
    link: string | null;
    priority: NotificationPriority;
  }): Promise<void> {
    const settings = await this.settings.getOrCreate(notification.userId);
    const isUrgent = notification.priority === NotificationPriority.URGENT;
    const quiet = this.settings.isQuietHoursNow(settings);
    const suppressed = quiet && !isUrgent;

    if (
      settings.emailEnabled &&
      settings.digestMode === 'INSTANT' &&
      !suppressed
    ) {
      const user = await this.prisma.user.findUnique({
        where: { id: notification.userId },
      });
      if (user) {
        await this.email
          .send({
            to: user.email,
            subject: notification.title,
            html: `<p>${notification.message ?? notification.title}</p>`,
            text: notification.message ?? notification.title,
          })
          .then(
            () =>
              this.prisma.notification.update({
                where: { id: notification.id },
                data: { sentViaEmail: true, sentViaEmailAt: new Date() },
              }),
            () => undefined,
          );
      }
    }

    if (settings.pushEnabled && !suppressed) {
      const subscriptions = await this.prisma.pushSubscription.findMany({
        where: { userId: notification.userId },
      });
      let delivered = false;
      for (const sub of subscriptions) {
        const result = await this.push.send(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          {
            title: notification.title,
            body: notification.message ?? undefined,
            url: notification.link ?? undefined,
          },
        );
        if (result.ok) {
          delivered = true;
        }
        if (result.expired) {
          await this.prisma.pushSubscription
            .delete({ where: { id: sub.id } })
            .catch(() => undefined);
        }
      }
      if (delivered) {
        await this.prisma.notification.update({
          where: { id: notification.id },
          data: { sentViaPush: true, sentViaPushAt: new Date() },
        });
      }
    }

    if (settings.discordEnabled && settings.discordWebhookUrl && !suppressed) {
      const content = notification.message
        ? `**${notification.title}**\n${notification.message}`
        : `**${notification.title}**`;
      const ok = await this.discord.sendToWebhook(
        settings.discordWebhookUrl,
        content,
      );
      if (ok) {
        await this.prisma.notification.update({
          where: { id: notification.id },
          data: { sentViaDiscord: true, sentViaDiscordAt: new Date() },
        });
      }
    }
  }

  async list(
    userId: string,
    page: number,
    limit: number,
    unreadOnly?: boolean,
    type?: 'system',
  ) {
    const where = {
      userId,
      ...(unreadOnly ? { isRead: false } : {}),
      ...(type === 'system' ? { type: NotificationType.SYSTEM } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        // Только публичная часть отправителя (без e-mail, причин банов и т.п.).
        include: {
          fromUser: { select: { id: true, username: true, avatar: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, isRead: false } });
  }

  /// Сообщить вкладкам пользователя актуальное число непрочитанных (ADR-0074).
  private async notifyChanged(userId: string): Promise<void> {
    this.gateway.emitChanged(userId, await this.unreadCount(userId));
  }

  private async ensureOwn(userId: string, id: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });
    if (!notification || notification.userId !== userId) {
      throw new NotFoundException('Уведомление не найдено');
    }
    return notification;
  }

  async markRead(userId: string, id: string) {
    const notification = await this.ensureOwn(userId, id);
    const updated = notification.isRead
      ? notification
      : await this.prisma.notification.update({
          where: { id },
          data: { isRead: true, readAt: new Date() },
        });
    await this.notifyChanged(userId);
    return updated;
  }

  async markUnread(userId: string, id: string) {
    await this.ensureOwn(userId, id);
    const updated = await this.prisma.notification.update({
      where: { id },
      data: { isRead: false, readAt: null },
    });
    await this.notifyChanged(userId);
    return updated;
  }

  async markAllRead(userId: string): Promise<{ count: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    await this.notifyChanged(userId);
    return { count: result.count };
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.ensureOwn(userId, id);
    await this.prisma.notification.delete({ where: { id } });
    await this.notifyChanged(userId);
  }

  /// «Удалить прочитанные» — непрочитанные остаются.
  async removeRead(userId: string): Promise<{ count: number }> {
    const result = await this.prisma.notification.deleteMany({
      where: { userId, isRead: true },
    });
    await this.notifyChanged(userId);
    return { count: result.count };
  }

  /// «Очистить» — все уведомления пользователя (подтверждение — на клиенте).
  async clearAll(userId: string): Promise<{ count: number }> {
    const result = await this.prisma.notification.deleteMany({
      where: { userId },
    });
    await this.notifyChanged(userId);
    return { count: result.count };
  }

  async subscribePush(userId: string, dto: PushSubscribeDto) {
    return this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: {
        userId,
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
        userAgent: dto.userAgent,
        deviceName: dto.deviceName,
      },
      update: {
        userId,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
        lastUsedAt: new Date(),
      },
    });
  }

  async unsubscribePush(userId: string, id: string): Promise<void> {
    const subscription = await this.prisma.pushSubscription.findUnique({
      where: { id },
    });
    if (!subscription || subscription.userId !== userId) {
      throw new NotFoundException('Подписка не найдена');
    }
    await this.prisma.pushSubscription.delete({ where: { id } });
  }

  async testDiscordWebhook(userId: string): Promise<{ sent: boolean }> {
    const settings = await this.settings.getOrCreate(userId);
    if (!settings.discordWebhookUrl) {
      throw new ForbiddenException('Discord webhook не настроен');
    }
    const sent = await this.discord.sendToWebhook(
      settings.discordWebhookUrl,
      'Тестовое уведомление twomc.su — вебхук подключён успешно.',
    );
    return { sent };
  }

  /// Ручная проверка "как будет выглядеть дайджест" — реальная периодическая
  /// агрегация по расписанию (cron) не входит в эту фазу, см. PHASE-12 doc.
  async sendDigestForUser(
    userId: string,
  ): Promise<{ sent: boolean; count: number }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }
    const unread = await this.prisma.notification.findMany({
      where: { userId, isRead: false },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    if (unread.length === 0) {
      return { sent: false, count: 0 };
    }
    const html = `<ul>${unread.map((n) => `<li>${n.title}${n.message ? ` — ${n.message}` : ''}</li>`).join('')}</ul>`;
    await this.email.send({
      to: user.email,
      subject: `twomc.su: ${unread.length} непрочитанных уведомлений`,
      html,
      text: unread.map((n) => n.title).join('\n'),
    });
    return { sent: true, count: unread.length };
  }
}
