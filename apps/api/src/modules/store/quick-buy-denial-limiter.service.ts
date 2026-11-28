import {
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { rateLimitKey } from '../../config/trust-proxy';
import { RedisService } from '../redis/redis.service';

/// ADR-0186 Р1: не более 30 отказов по нику в час на IP (IPv6 по /64).
/// Turnstile не включён (нет ключей). Redis недоступен — 503 (fail closed).
/// Ник и IP в логи не пишутся; в Redis только HMAC агрегированного IP-ключа.
export const QUICK_BUY_DENIALS_PER_HOUR = 30;
const HOUR_SEC = 3600;

/// Атомарно: INCR, TTL ставится при создании ключа (один раунд, без гонки
/// между SET NX и INCR и без ключа без TTL).
const RECORD_SCRIPT =
  "local c = redis.call('INCR', KEYS[1]) " +
  "if c == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end " +
  'return c';

@Injectable()
export class QuickBuyDenialLimiter {
  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  /// Ключ Redis — HMAC агрегированного IP-ключа (/64 для IPv6): голый IP в
  /// Redis не хранится. Ключ HMAC — существующий секрет конфигурации
  /// (JWT_REFRESH_SECRET) с отдельной меткой назначения; нового секрета нет.
  private key(rawIp: string | undefined): string {
    const secret = this.config.get<string>('JWT_REFRESH_SECRET', '');
    const digest = createHmac('sha256', secret)
      .update(`quick-buy-deny:${rateLimitKey(rawIp)}`)
      .digest('hex')
      .slice(0, 32);
    return `store:qb:deny:${digest}`;
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
      await this.redis.client.eval(RECORD_SCRIPT, 1, key, HOUR_SEC);
    } catch {
      // Счётчик отказов — защита второго рубежа; throttle 10/мин остаётся.
    }
  }
}
