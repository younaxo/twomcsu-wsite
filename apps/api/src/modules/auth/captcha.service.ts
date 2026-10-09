import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/// Cloudflare Turnstile — централизованная anti-bot проверка публичных
/// write-действий (регистрация, вход, восстановление пароля, формы). Токен с
/// frontend сам по себе ничего не значит: backend ОБЯЗАН подтвердить его через
/// Siteverify. Secret (`TURNSTILE_SECRET_KEY`) никогда не уходит на frontend.
///
/// Development: официальные тестовые ключи Cloudflare (site
/// `1x00000000000000000000AA`, secret `1x0000000000000000000000000000000AA`) —
/// виджет всегда проходит, Siteverify отвечает success. `TURNSTILE_DISABLED=true`
/// допустим только для автотестов без сети (CI e2e), не для dev/prod.
const TURNSTILE_VERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TIMEOUT_MS = 5000;

interface TurnstileVerifyResponse {
  success: boolean;
  'error-codes'?: string[];
}

@Injectable()
export class CaptchaService {
  private readonly logger = new Logger(CaptchaService.name);

  constructor(private readonly config: ConfigService) {}

  async verify(token: string | undefined, remoteIp?: string): Promise<boolean> {
    if (this.config.get<boolean>('TURNSTILE_DISABLED')) {
      return true;
    }
    if (!token) {
      return false;
    }

    const secret = this.config.get<string>('TURNSTILE_SECRET_KEY');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const body = new URLSearchParams({
        secret: secret ?? '',
        response: token,
      });
      if (remoteIp) {
        body.set('remoteip', remoteIp);
      }
      const response = await fetch(TURNSTILE_VERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: controller.signal,
      });
      const data = (await response.json()) as TurnstileVerifyResponse;
      if (data.success !== true) {
        this.logger.debug(
          `Turnstile отклонил токен: ${(data['error-codes'] ?? []).join(', ') || 'без кода'}`,
        );
      }
      return data.success === true;
    } catch (error) {
      this.logger.warn(
        `Turnstile siteverify недоступен: ${(error as Error).message}`,
      );
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }
}
