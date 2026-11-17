import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { NONCE_TTL_S } from './bridge.constants';

/// Лимиты 5.4 контракта (значения по умолчанию).
export const REQUESTS_BURST_PER_SECOND = 30;
export const REQUESTS_PER_10S = 100;
export const EVENTS_PER_MINUTE = 3000;
export const CONCURRENT_REQUESTS = 2;
/// Грубый счётчик неудачных аутентификаций по подсети (2.3, п. 9).
export const AUTH_FAILURES_PER_MINUTE = 30;
/// TTL маркера свежести записи: дольше срока хранения журнала (7 суток).
export const STALE_MARKER_TTL_S = 8 * 24 * 60 * 60;
const SLOT_SAFETY_TTL_S = 30;

const ADVANCE_SCRIPT = `
local c = redis.call('GET', KEYS[1])
if (not c) or (tonumber(c) <= tonumber(ARGV[1])) then
  redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
  return 1
end
return 0
`;

/// Все обращения приёмника к Redis. Ошибки Redis не глотаются: вызывающий
/// отвечает 503 (fail-closed, 2.3 п. 8). В ключах нет секретов и IP игроков;
/// ключ по IP сервера - подсеть, значение хранится минуту.
@Injectable()
export class BridgeRedisService {
  constructor(private readonly redis: RedisService) {}

  /// `SET NX EX` нонса; `false` - нонс уже использован.
  async claimNonce(keyId: string, nonce: string): Promise<boolean> {
    const res = await this.redis.client.set(
      `bridge:nonce:${keyId}:${nonce}`,
      '1',
      'EX',
      NONCE_TTL_S,
      'NX',
    );
    return res === 'OK';
  }

  /// Секунд до снятия блокировки по неудачным аутентификациям; 0 - не заблокирован.
  async authFailureRetryAfter(ipKey: string): Promise<number> {
    const key = `bridge:authfail:${ipKey}`;
    const raw = await this.redis.client.get(key);
    if (raw === null || Number(raw) < AUTH_FAILURES_PER_MINUTE) return 0;
    const ttl = await this.redis.client.ttl(key);
    return ttl > 0 ? ttl : 1;
  }

  async recordAuthFailure(ipKey: string): Promise<void> {
    const key = `bridge:authfail:${ipKey}`;
    const n = await this.redis.client.incr(key);
    if (n === 1) await this.redis.client.expire(key, 60);
  }

  private async bucket(
    scope: string,
    keyId: string,
    windowS: number,
    amount: number,
    limit: number,
  ): Promise<number> {
    const nowS = Math.floor(Date.now() / 1000);
    const bucket = Math.floor(nowS / windowS);
    const key = `bridge:rl:${scope}:${keyId}:${bucket}`;
    const n = await this.redis.client.incrby(key, amount);
    if (n === amount) await this.redis.client.expire(key, windowS + 1);
    if (n <= limit) return 0;
    return Math.max(1, (bucket + 1) * windowS - nowS);
  }

  /// Лимит запросов на ключ: всплеск 30 в секунду и 100 за 10 секунд
  /// (10 в секунду в среднем). Возвращает Retry-After в секундах, 0 - можно.
  async requestRetryAfter(keyId: string): Promise<number> {
    const burst = await this.bucket(
      'r1',
      keyId,
      1,
      1,
      REQUESTS_BURST_PER_SECOND,
    );
    if (burst > 0) return burst;
    return this.bucket('r10', keyId, 10, 1, REQUESTS_PER_10S);
  }

  /// События на сервер: 3000 в минуту.
  async eventsRetryAfter(keyId: string, count: number): Promise<number> {
    return this.bucket('ev', keyId, 60, count, EVENTS_PER_MINUTE);
  }

  async acquireSlot(keyId: string): Promise<boolean> {
    const key = `bridge:conc:${keyId}`;
    const n = await this.redis.client.incr(key);
    await this.redis.client.expire(key, SLOT_SAFETY_TTL_S);
    if (n > CONCURRENT_REQUESTS) {
      await this.redis.client.decr(key);
      return false;
    }
    return true;
  }

  async releaseSlot(keyId: string): Promise<void> {
    const n = await this.redis.client.decr(`bridge:conc:${keyId}`);
    if (n < 0) await this.redis.client.del(`bridge:conc:${keyId}`);
  }

  /// Приёмник не успевает: следующие запросы ключа получают 429.
  async markSlow(keyId: string, seconds: number): Promise<void> {
    await this.redis.client.set(`bridge:slow:${keyId}`, '1', 'EX', seconds);
  }

  async slowRetryAfter(keyId: string): Promise<number> {
    const ttl = await this.redis.client.ttl(`bridge:slow:${keyId}`);
    return ttl > 0 ? ttl : 0;
  }

  private staleKey(slug: string, kind: string, sourceId: string): string {
    return `bridge:ps:${slug}:${kind}:${sourceId}`;
  }

  /// `occurredAt` (мс) последнего применённого состояния записи или null.
  async getMarker(
    slug: string,
    kind: string,
    sourceId: string,
  ): Promise<number | null> {
    const raw = await this.redis.client.get(
      this.staleKey(slug, kind, sourceId),
    );
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  /// Продвинуть маркер до `max(текущий, occurredMs)`.
  async advanceMarker(
    slug: string,
    kind: string,
    sourceId: string,
    occurredMs: number,
  ): Promise<void> {
    await this.redis.client.eval(
      ADVANCE_SCRIPT,
      1,
      this.staleKey(slug, kind, sourceId),
      String(occurredMs),
      String(STALE_MARKER_TTL_S),
    );
  }
}
