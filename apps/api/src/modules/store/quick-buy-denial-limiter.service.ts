import {
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { rateLimitKey } from '../../config/trust-proxy';
import { RedisService } from '../redis/redis.service';

/// ADR-0186 Р1: не более 30 отказов по нику в час на IP (IPv6 по /64).
/// Turnstile не включён (нет ключей). Redis недоступен — 503 (fail closed).
/// Ник и IP в логи не пишутся; ключ содержит только агрегированный IP-ключ.
export const QUICK_BUY_DENIALS_PER_HOUR = 30;
const HOUR_SEC = 3600;

@Injectable()
export class QuickBuyDenialLimiter {
  constructor(private readonly redis: RedisService) {}

  private key(rawIp: string | undefined): string {
    return `store:qb:deny:${rateLimitKey(rawIp)}`;
  }

  /// Бросает 429, если лимит отказов за час исчерпан. Счётчик не увеличивает.
  async assertAllowed(rawIp: string | undefined): Promise<void> {
    let count = 0;
    let ttl = HOUR_SEC;
    try {
      const key = this.key(rawIp);
      count = Number((await this.redis.client.get(key)) ?? 0);
      if (count >= QUICK_BUY_DENIALS_PER_HOUR) {
        const t = await this.redis.client.ttl(key);
        ttl = t > 0 ? t : HOUR_SEC;
      }
    } catch {
      throw new ServiceUnavailableException(
        'Сервис временно недоступен, попробуйте позже',
      );
    }
    if (count >= QUICK_BUY_DENIALS_PER_HOUR) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          code: 'quick_buy_rate_limited',
          message: 'Слишком много попыток. Попробуйте позже',
          retryAfter: ttl,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async recordDenial(rawIp: string | undefined): Promise<void> {
    try {
      const key = this.key(rawIp);
      await this.redis.client
        .multi()
        .set(key, '0', 'EX', HOUR_SEC, 'NX')
        .incr(key)
        .exec();
    } catch {
      // Счётчик отказов — защита второго рубежа; throttle 10/мин остаётся.
    }
  }
}
