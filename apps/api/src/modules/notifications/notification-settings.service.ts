import { BadRequestException, Injectable } from '@nestjs/common';
import { NotificationSettings, NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isValidDiscordWebhookUrl } from './discord-webhook-url.util';
import { UpdateDigestDto } from './dto/update-digest.dto';
import { UpdateNotificationSettingsDto } from './dto/update-notification-settings.dto';

const DEFAULTS = {
  emailEnabled: true,
  pushEnabled: true,
  discordEnabled: false,
  soundEnabled: true,
  digestMode: 'INSTANT' as const,
  digestTime: '09:00',
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
};

/// Ответ настроек для клиента (ADR-0110): без id/userId и без самого URL
/// вебхука — токен в нём даёт право писать в канал. Видно только «подключён»
/// и маску `…/webhooks/<id>/••••`.
export function settingsView(
  row: NotificationSettings,
  emailAvailable: boolean,
) {
  const webhook = row.discordWebhookUrl;
  const id = webhook?.match(/\/api\/webhooks\/(\d+)\//)?.[1] ?? null;
  return {
    pushEnabled: row.pushEnabled,
    soundEnabled: row.soundEnabled,
    pushPreview: row.pushPreview,
    foregroundEnabled: row.foregroundEnabled,
    emailEnabled: row.emailEnabled,
    quietHoursEnabled: row.quietHoursEnabled,
    quietHoursStart: row.quietHoursStart,
    quietHoursEnd: row.quietHoursEnd,
    typeSettings: (row.typeSettings ?? {}) as Record<string, boolean>,
    discordEnabled: row.discordEnabled && !!webhook,
    discordWebhookHint: webhook
      ? `discord.com/api/webhooks/${id ?? '…'}/••••`
      : null,
    digestMode: row.digestMode,
    digestTime: row.digestTime,
    emailAvailable,
  };
}

@Injectable()
export class NotificationSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreate(userId: string) {
    const existing = await this.prisma.notificationSettings.findUnique({
      where: { userId },
    });
    if (existing) {
      return existing;
    }
    return this.prisma.notificationSettings.create({ data: { userId } });
  }

  async update(userId: string, dto: UpdateNotificationSettingsDto) {
    await this.getOrCreate(userId);
    return this.prisma.notificationSettings.update({
      where: { userId },
      data: dto,
    });
  }

  /// typeSettings — произвольная JSON-карта `{ [NotificationType]: boolean }`,
  /// переопределяющая глобальные emailEnabled/pushEnabled/discordEnabled для
  /// конкретного типа (например отключить email только для CHAT_MENTION).
  async updateType(userId: string, type: NotificationType, enabled: boolean) {
    const settings = await this.getOrCreate(userId);
    const typeSettings = {
      ...(settings.typeSettings as Record<string, boolean>),
      [type]: enabled,
    };
    return this.prisma.notificationSettings.update({
      where: { userId },
      data: { typeSettings },
    });
  }

  async isTypeEnabled(
    userId: string,
    type: NotificationType,
  ): Promise<boolean> {
    const settings = await this.getOrCreate(userId);
    const typeSettings = settings.typeSettings as Record<string, boolean>;
    return typeSettings[type] ?? true;
  }

  async reset(userId: string) {
    await this.getOrCreate(userId);
    return this.prisma.notificationSettings.update({
      where: { userId },
      data: { ...DEFAULTS, typeSettings: {}, discordWebhookUrl: null },
    });
  }

  async updateDigest(userId: string, dto: UpdateDigestDto) {
    await this.getOrCreate(userId);
    return this.prisma.notificationSettings.update({
      where: { userId },
      data: { digestMode: dto.digestMode, digestTime: dto.digestTime },
    });
  }

  async saveDiscordWebhook(userId: string, url: string) {
    if (!isValidDiscordWebhookUrl(url)) {
      throw new BadRequestException('Недопустимый Discord webhook URL');
    }
    await this.getOrCreate(userId);
    return this.prisma.notificationSettings.update({
      where: { userId },
      data: { discordWebhookUrl: url, discordEnabled: true },
    });
  }

  async deleteDiscordWebhook(userId: string) {
    await this.getOrCreate(userId);
    return this.prisma.notificationSettings.update({
      where: { userId },
      data: { discordWebhookUrl: null, discordEnabled: false },
    });
  }

  /// true, если сейчас "тихие часы" пользователя — поддерживает интервал,
  /// переходящий через полночь (например 22:00–08:00).
  isQuietHoursNow(settings: {
    quietHoursEnabled: boolean;
    quietHoursStart: string | null;
    quietHoursEnd: string | null;
  }): boolean {
    if (
      !settings.quietHoursEnabled ||
      !settings.quietHoursStart ||
      !settings.quietHoursEnd
    ) {
      return false;
    }
    const now = new Date();
    const minutesNow = now.getHours() * 60 + now.getMinutes();
    const [startH, startM] = settings.quietHoursStart.split(':').map(Number);
    const [endH, endM] = settings.quietHoursEnd.split(':').map(Number);
    const start = startH * 60 + startM;
    const end = endH * 60 + endM;
    if (start === end) {
      return false;
    }
    if (start < end) {
      return minutesNow >= start && minutesNow < end;
    }
    return minutesNow >= start || minutesNow < end;
  }
}
