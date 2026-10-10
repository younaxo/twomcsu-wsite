import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountType,
  NotificationPriority,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  BulkSystemMessageDto,
  SendSystemMessageDto,
  SystemMessageAudienceDto,
  SystemMessageContentDto,
} from './dto/system-message.dto';

/// Защищённый отправитель (зеркало `SYSTEM_MESSAGE_SENDER` из shared).
const SYSTEM_SENDER = 'system';

/// Только обычные активные аккаунты: не SYSTEM и не забаненные.
const ACTIVE_USER: Prisma.UserWhereInput = {
  accountType: AccountType.DEFAULT,
  isBanned: false,
};

/// Системные сообщения от имени twomc.su (ADR-0080): уведомление типа SYSTEM
/// с `metadata.sender = 'system'`. Доставка не зависит от отключения типа в
/// настройках уведомлений пользователя — это сообщения сайта.
@Injectable()
export class CommunicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  async searchRecipients(q: string | undefined) {
    const query = q?.trim();
    return this.prisma.user.findMany({
      where: {
        ...ACTIVE_USER,
        ...(query
          ? {
              OR: [
                { username: { contains: query, mode: 'insensitive' } },
                { tag: { contains: query, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: { id: true, username: true, tag: true, avatar: true },
      orderBy: { username: 'asc' },
      take: 10,
    });
  }

  async send(dto: SendSystemMessageDto, actorId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: dto.userId, ...ACTIVE_USER },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException('Получатель не найден или недоступен');
    }
    const notification = await this.deliver(user.id, dto);
    await this.audit.log({
      actorId,
      action: 'communications.message.send',
      targetType: 'User',
      targetId: user.id,
      changes: this.auditContent(dto),
    });
    return { id: notification.id };
  }

  async previewBulk(audience: SystemMessageAudienceDto) {
    return {
      recipients: await this.prisma.user.count({
        where: this.audienceWhere(audience),
      }),
    };
  }

  async sendBulk(dto: BulkSystemMessageDto, actorId: string) {
    const targets = await this.prisma.user.findMany({
      where: this.audienceWhere(dto.audience),
      select: { id: true },
    });
    if (targets.length === 0) {
      throw new BadRequestException('Нет получателей');
    }
    if (targets.length !== dto.confirmCount) {
      throw new ConflictException(
        `Число получателей изменилось: ${targets.length} вместо ${dto.confirmCount}. Проверьте ещё раз.`,
      );
    }
    let delivered = 0;
    for (const target of targets) {
      await this.deliver(target.id, dto);
      delivered += 1;
    }
    const { audience } = dto;
    await this.audit.log({
      actorId,
      action: 'communications.message.bulk',
      targetType: audience.kind === 'role' ? 'Role' : 'Audience',
      targetId: audience.kind === 'role' ? audience.roleId : audience.kind,
      severity: 'warning',
      changes: {
        ...this.auditContent(dto),
        audience: audience.kind,
        ...(audience.kind === 'users' ? { userIds: audience.userIds } : {}),
        recipients: targets.length,
      },
    });
    return { recipients: targets.length, delivered };
  }

  private audienceWhere(
    audience: SystemMessageAudienceDto,
  ): Prisma.UserWhereInput {
    switch (audience.kind) {
      case 'all':
        return ACTIVE_USER;
      case 'role':
        if (!audience.roleId) throw new BadRequestException('Выберите роль');
        return { ...ACTIVE_USER, roles: { some: { roleId: audience.roleId } } };
      case 'users':
        if (!audience.userIds?.length) {
          throw new BadRequestException('Выберите получателей');
        }
        return { ...ACTIVE_USER, id: { in: audience.userIds } };
    }
  }

  private async deliver(userId: string, content: SystemMessageContentDto) {
    const notification = await this.notifications.create({
      userId,
      type: NotificationType.SYSTEM,
      title: content.title.trim(),
      message: content.message.trim(),
      link: content.link || undefined,
      priority: NotificationPriority.HIGH,
      metadata: { sender: SYSTEM_SENDER },
      bypassPreferences: true,
    });
    // bypassPreferences — create всегда возвращает уведомление.
    return notification!;
  }

  /// В аудит — заголовок, длина и ссылка; полный текст остаётся в уведомлении.
  private auditContent(content: SystemMessageContentDto) {
    return {
      title: content.title.trim(),
      messageLength: content.message.trim().length,
      link: content.link || null,
    };
  }
}
