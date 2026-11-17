import { Injectable } from '@nestjs/common';
import { normalizeIp, rateLimitKey } from '../../config/trust-proxy';
import { RedisService } from '../redis/redis.service';

const CAPTCHA_AFTER_ATTEMPTS = 3;
const BLOCK_AFTER_ATTEMPTS = 10;
const WINDOW_SECONDS = 900;

/// Счётчик привязан к IP (IPv6 — к подсети /64, ADR-0163; не к аккаунту) — см. docs/technical/09-AUTHENTICATION.md.
///
/// Ключи Redis (все с TTL, IP — персональные данные, в логи не пишутся):
///  - `bruteforce:login:<rateLimitKey>` — счётчик неудач, EX 900 с первой неудачи;
///  - `bruteforce:blocked:<rateLimitKey>` — блокировка, EX 900 при каждой неудаче >= 10;
///  - `bruteforce:lastip:<rateLimitKey>` — последний полный нормализованный IP
///    неудачи для админки (Q21), EX 900 обновляется при КАЖДОЙ неудаче, поэтому
///    живёт не меньше счётчика и блокировки. Шаблоны login/blocked/lastip не
///    пересекаются: после `bruteforce:` идут разные литералы.
@Injectable()
export class BruteForceService {
  constructor(private readonly redis: RedisService) {}

  private counterKey(ip: string): string {
    return `bruteforce:login:${rateLimitKey(ip)}`;
  }

  private lastIpKey(ip: string): string {
    return `bruteforce:lastip:${rateLimitKey(ip)}`;
  }

  private blockedKey(ip: string): string {
    return `bruteforce:blocked:${rateLimitKey(ip)}`;
  }

  async isBlocked(ip: string): Promise<boolean> {
    const blocked = await this.redis.client.get(this.blockedKey(ip));
    return blocked !== null;
  }

  async requiresCaptcha(ip: string): Promise<boolean> {
    const count = await this.redis.client.get(this.counterKey(ip));
    return count !== null && Number(count) >= CAPTCHA_AFTER_ATTEMPTS;
  }

  async registerFailure(ip: string): Promise<void> {
    // Полный адрес (не ключ подсети) — чтобы админ видел реального клиента.
    await this.redis.client.set(
      this.lastIpKey(ip),
      normalizeIp(ip),
      'EX',
      WINDOW_SECONDS,
    );
    const key = this.counterKey(ip);
    const count = await this.redis.client.incr(key);
    if (count === 1) {
      await this.redis.client.expire(key, WINDOW_SECONDS);
    }
    if (count >= BLOCK_AFTER_ATTEMPTS) {
      await this.redis.client.set(
        this.blockedKey(ip),
        '1',
        'EX',
        WINDOW_SECONDS,
      );
    }
  }

  async reset(ip: string): Promise<void> {
    await this.redis.client.del(
      this.counterKey(ip),
      this.blockedKey(ip),
      this.lastIpKey(ip),
    );
  }
}
