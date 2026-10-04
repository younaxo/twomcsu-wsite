import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

const CAPTCHA_AFTER_ATTEMPTS = 3;
const BLOCK_AFTER_ATTEMPTS = 10;
const WINDOW_SECONDS = 900;

/// Счётчик привязан к IP (не к аккаунту) — см. docs/technical/09-AUTHENTICATION.md.
@Injectable()
export class BruteForceService {
  constructor(private readonly redis: RedisService) {}

  private counterKey(ip: string): string {
    return `bruteforce:login:${ip}`;
  }

  private blockedKey(ip: string): string {
    return `bruteforce:blocked:${ip}`;
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
    await this.redis.client.del(this.counterKey(ip), this.blockedKey(ip));
  }
}
