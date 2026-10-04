import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const HCAPTCHA_VERIFY_URL = 'https://api.hcaptcha.com/siteverify';
const TIMEOUT_MS = 5000;

interface HCaptchaVerifyResponse {
  success: boolean;
}

@Injectable()
export class CaptchaService {
  private readonly logger = new Logger(CaptchaService.name);

  constructor(private readonly config: ConfigService) {}

  async verify(token: string | undefined): Promise<boolean> {
    if (this.config.get<boolean>('HCAPTCHA_DISABLED')) {
      return true;
    }
    if (!token) {
      return false;
    }

    const secret = this.config.get<string>('HCAPTCHA_SECRET');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(HCAPTCHA_VERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret: secret ?? '', response: token }),
        signal: controller.signal,
      });
      const data = (await response.json()) as HCaptchaVerifyResponse;
      return data.success === true;
    } catch (error) {
      this.logger.warn(`hCaptcha verify failed: ${(error as Error).message}`);
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }
}
