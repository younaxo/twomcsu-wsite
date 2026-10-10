import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webPush from 'web-push';

export interface PushPayload {
  title: string;
  body?: string;
  /// Только внутренний путь сайта (push-policy).
  url?: string;
  /// id уведомления — Service Worker не показывает одно и то же дважды.
  id?: string;
  type?: string;
  /// Группа в системе (например, одна беседа) — новое заменяет старое.
  tag?: string;
}

/// Без VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY push-доставка выключается
/// (логируется, не падает) — см. RISKS.md R7. Тот же паттерн, что и у
/// EmailService (R4) для SMTP.
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly publicKey: string;
  private readonly configured: boolean;

  constructor(private readonly config: ConfigService) {
    this.publicKey = this.config.get<string>('VAPID_PUBLIC_KEY', '');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY', '');
    this.configured = this.publicKey.length > 0 && privateKey.length > 0;

    if (this.configured) {
      webPush.setVapidDetails(
        this.config.get<string>('VAPID_SUBJECT', 'mailto:admin@twomc.su'),
        this.publicKey,
        privateKey,
      );
    }
  }

  isConfigured(): boolean {
    return this.configured;
  }

  getPublicKey(): string | null {
    return this.configured ? this.publicKey : null;
  }

  /// `expired: true` — endpoint больше не действителен (410/404 от push-
  /// сервиса браузера), вызывающий код должен удалить подписку, не дожидаясь
  /// периодической очистки.
  async send(
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: PushPayload,
  ): Promise<{ ok: boolean; expired: boolean }> {
    if (!this.configured) {
      this.logger.warn(
        'VAPID-ключи не заданы — push-уведомление не отправлено',
      );
      return { ok: false, expired: false };
    }
    try {
      await webPush.sendNotification(subscription, JSON.stringify(payload));
      return { ok: true, expired: false };
    } catch (err) {
      const statusCode = (err as webPush.WebPushError).statusCode;
      this.logger.warn(`Ошибка отправки push: ${(err as Error).message}`);
      return { ok: false, expired: statusCode === 404 || statusCode === 410 };
    }
  }
}
