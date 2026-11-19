import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { INCR_EXPIRE_SCRIPT } from '../bridge/bridge-redis.service';
import { EVENTS_PER_MINUTE, REQUESTS_PER_MINUTE } from './giveaway.constants';

/// Обращения приёмника к Redis. Ошибки не глотаются: вызывающий отвечает 503
/// (fail-closed). В ключах нет секретов и IP игроков.
@Injectable()
export class GiveawayRedisService {
  constructor(private readonly redis: RedisService) {}

  /// `SET NX EX`; `false` - нонс уже использован. TTL >= 2 окон времени.
  async claimNonce(
    keyId: string,
    nonce: string,
    ttlS: number,
  ): Promise<boolean> {
    const res = await this.redis.client.set(
      `giveaway:nonce:${keyId}:${nonce}`,
      '1',
      'EX',
      ttlS,
      'NX',
    );
    return res === 'OK';
  }

  private async bucket(
    scope: string,
    serverId: string,
    amount: number,
    limit: number,
  ): Promise<number> {
    const nowS = Math.floor(Date.now() / 1000);
    const bucket = Math.floor(nowS / 60);
    const n = Number(
      await this.redis.client.eval(
        INCR_EXPIRE_SCRIPT,
        1,
        `giveaway:rl:${scope}:${serverId}:${bucket}`,
        String(amount),
        '61',
        'first',
      ),
    );
    if (n <= limit) return 0;
    return Math.max(1, (bucket + 1) * 60 - nowS);
  }

  /// Retry-After в секундах; 0 - можно.
  requestRetryAfter(serverId: string): Promise<number> {
    return this.bucket('req', serverId, 1, REQUESTS_PER_MINUTE);
  }

  eventsRetryAfter(serverId: string, count: number): Promise<number> {
    return this.bucket('ev', serverId, count, EVENTS_PER_MINUTE);
  }
}
