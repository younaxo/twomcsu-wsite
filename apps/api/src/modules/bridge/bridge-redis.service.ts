import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { RedisService } from '../redis/redis.service';
import { NONCE_TTL_S } from './bridge.constants';

/// Лимиты 5.4 контракта (значения по умолчанию).
export const REQUESTS_BURST_PER_SECOND = 30;
export const REQUESTS_PER_10S = 100;
export const EVENTS_PER_MINUTE = 3000;
export const CONCURRENT_REQUESTS = 2;
/// Счётчик неудачных аутентификаций по паре (подсеть, key-id) (2.3, п. 9, M1).
export const AUTH_FAILURES_PER_MINUTE = 30;
const AUTH_FAILURE_WINDOW_S = 60;
/// TTL маркера свежести записи: дольше срока хранения журнала (7 суток).
export const STALE_MARKER_TTL_S = 8 * 24 * 60 * 60;
const SLOT_SAFETY_TTL_S = 30;
/// Срок дедупликации `player.*` (5.2 контракта).
export const PLAYER_EVENT_TTL_S = 24 * 60 * 60;
/// Блокировка записи на время применения: дольше таймаута транзакции зеркала.
export const RECORD_LOCK_TTL_MS = 15_000;
const RECORD_LOCK_WAIT_MS = 5_000;
const RECORD_LOCK_POLL_MS = 25;

/// INCRBY + EXPIRE одной атомарной командой (L1): при сбое между командами
/// ключ не остаётся без TTL. ARGV: шаг, TTL (с), режим `first` (TTL только
/// при создании ключа) или `always` (обновлять TTL каждый раз).
export const INCR_EXPIRE_SCRIPT = `
local n = redis.call('INCRBY', KEYS[1], ARGV[1])
if ARGV[3] == 'always' or n == tonumber(ARGV[1]) then
  redis.call('EXPIRE', KEYS[1], ARGV[2])
end
return n
`;

/// Атомарное «сравнить и установить» маркера свежести записи (M2): маркер
/// обновляется, только если новый не меньше текущего; 0 - событие устарело.
export const CLAIM_MARKER_SCRIPT = `
local c = redis.call('GET', KEYS[1])
if c and tonumber(c) > tonumber(ARGV[1]) then
  return 0
end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
return 1
`;

/// Снять блокировку, только если токен совпадает (не чужая после истечения TTL).
export const RELEASE_LOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

/// Не удалось получить блокировку записи вовремя: ответ 503, плагин повторит.
export class RecordLockTimeout extends Error {
  constructor() {
    super('Блокировка записи Bridge занята');
    this.name = 'RecordLockTimeout';
  }
}

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

  private authFailKey(ipKey: string, keyId: string): string {
    return `bridge:authfail:${ipKey}:${keyId}`;
  }

  /// Секунд до снятия блокировки по неудачным аутентификациям пары
  /// (подсеть, key-id); 0 - не заблокирован. Блокировка не отменяет верно
  /// подписанный запрос: её применяет только guard после неверной подписи.
  async authFailureRetryAfter(ipKey: string, keyId: string): Promise<number> {
    const key = this.authFailKey(ipKey, keyId);
    const raw = await this.redis.client.get(key);
    if (raw === null || Number(raw) < AUTH_FAILURES_PER_MINUTE) return 0;
    const ttl = await this.redis.client.ttl(key);
    return ttl > 0 ? ttl : 1;
  }

  async recordAuthFailure(ipKey: string, keyId: string): Promise<void> {
    await this.incrExpire(
      this.authFailKey(ipKey, keyId),
      1,
      AUTH_FAILURE_WINDOW_S,
      'first',
    );
  }

  private async incrExpire(
    key: string,
    amount: number,
    ttlS: number,
    mode: 'first' | 'always',
  ): Promise<number> {
    const n = await this.redis.client.eval(
      INCR_EXPIRE_SCRIPT,
      1,
      key,
      String(amount),
      String(ttlS),
      mode,
    );
    return Number(n);
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
    const n = await this.incrExpire(key, amount, windowS + 1, 'first');
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
    const n = await this.incrExpire(key, 1, SLOT_SAFETY_TTL_S, 'always');
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

  /// Атомарно (Lua): маркер записи становится `occurredMs`, если текущий не
  /// больше; `false` - в Redis уже есть более новое состояние (событие stale).
  /// Равное значение проходит: при равенстве побеждает принятое позже, а
  /// повтор события после сбоя применения не считается устаревшим.
  async claimMarker(
    slug: string,
    kind: string,
    sourceId: string,
    occurredMs: number,
  ): Promise<boolean> {
    const res = await this.redis.client.eval(
      CLAIM_MARKER_SCRIPT,
      1,
      this.staleKey(slug, kind, sourceId),
      String(occurredMs),
      String(STALE_MARKER_TTL_S),
    );
    return Number(res) === 1;
  }

  /// Текущий маркер записи без изменения (L2: сравнение до записи в БД,
  /// сдвиг маркера - после неё через `claimMarker`); null - маркера нет.
  async peekMarker(
    slug: string,
    kind: string,
    sourceId: string,
  ): Promise<number | null> {
    const cur = await this.redis.client.get(
      this.staleKey(slug, kind, sourceId),
    );
    if (cur === null) return null;
    const n = Number(cur);
    return Number.isFinite(n) ? n : null;
  }

  /// Дедупликация `player.*` в Redis (контракт 5.2, TTL 24 часа). Значение
  /// `r:<hash>` - принято, применение не завершено (повтор применяется
  /// заново); `a:<hash>` - применено. Другой хэш при том же `eventId` - conflict.
  async claimPlayerEvent(
    slug: string,
    eventId: string,
    hash: string,
  ): Promise<'new' | 'retry' | 'duplicate' | 'conflict'> {
    const key = `bridge:pe:${slug}:${eventId}`;
    const set = await this.redis.client.set(
      key,
      `r:${hash}`,
      'EX',
      PLAYER_EVENT_TTL_S,
      'NX',
    );
    if (set === 'OK') return 'new';
    const cur = await this.redis.client.get(key);
    if (cur === null) return 'new';
    if (cur.slice(2) !== hash) return 'conflict';
    return cur.startsWith('a:') ? 'duplicate' : 'retry';
  }

  async markPlayerEventApplied(
    slug: string,
    eventId: string,
    hash: string,
  ): Promise<void> {
    await this.redis.client.set(
      `bridge:pe:${slug}:${eventId}`,
      `a:${hash}`,
      'EX',
      PLAYER_EVENT_TTL_S,
    );
  }

  /// Выполнить `fn` под блокировкой записи `(slug, kind, sourceId)`: события
  /// одной записи применяются по одному (порядок публикации = порядок
  /// захвата маркера), а повтор события ждёт завершения первого применения.
  /// Не получили блокировку за ~5 с - `RecordLockTimeout` (503).
  async withRecordLock<T>(
    slug: string,
    kind: string,
    sourceId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const key = `bridge:pl:${slug}:${kind}:${sourceId}`;
    const token = randomBytes(12).toString('hex');
    const deadline = Date.now() + RECORD_LOCK_WAIT_MS;
    for (;;) {
      const res = await this.redis.client.set(
        key,
        token,
        'PX',
        RECORD_LOCK_TTL_MS,
        'NX',
      );
      if (res === 'OK') break;
      if (Date.now() >= deadline) throw new RecordLockTimeout();
      await new Promise((r) => setTimeout(r, RECORD_LOCK_POLL_MS));
    }
    try {
      return await fn();
    } finally {
      try {
        await this.redis.client.eval(RELEASE_LOCK_SCRIPT, 1, key, token);
      } catch {
        // Блокировка сама истечёт по TTL.
      }
    }
  }
}
