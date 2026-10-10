/// Настройки уведомлений и push-устройства (ADR-0097).

/// `GET|PATCH /notifications/settings` (поля, нужные клиенту).
export interface NotificationSettingsDto {
  pushEnabled: boolean;
  soundEnabled: boolean;
  /// Имя отправителя и текст в системных push.
  pushPreview: boolean;
  /// Тост и звук в интерфейсе, когда сайт открыт.
  foregroundEnabled: boolean;
  emailEnabled: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  /// Включение по типам (`MESSAGE_RECEIVED` и др.); нет ключа — включено.
  typeSettings: Record<string, boolean>;
  /// Личный Discord-вебхук подключён (ADR-0110); сам URL с токеном не отдаётся.
  discordEnabled: boolean;
  /// Маска `discord.com/api/webhooks/<id>/••••`; null — не подключён.
  discordWebhookHint: string | null;
  /// Письма: сразу (INSTANT) или сводкой.
  digestMode: DigestMode;
  /// Время сводки `HH:mm`.
  digestTime: string | null;
  /// На сервере настроен SMTP — письма реально уходят.
  emailAvailable: boolean;
}

export type DigestMode = 'INSTANT' | 'HOURLY' | 'DAILY' | 'WEEKLY';

export type UpdateNotificationSettingsRequest = Partial<
  Pick<
    NotificationSettingsDto,
    'pushEnabled' | 'soundEnabled' | 'pushPreview' | 'foregroundEnabled' | 'emailEnabled'
  >
>;

/// `GET /notifications/push/subscriptions` — устройства без ключей подписки.
export interface PushDeviceDto {
  id: string;
  deviceName: string | null;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string;
}

/// `GET /notifications/push/vapid-key`.
export interface VapidKeyResponse {
  publicKey: string | null;
  configured: boolean;
}
