import { randomUUID } from 'crypto';

/// Минимум Redis-клиента, нужный блокировке (ioredis ему удовлетворяет).
export interface LeaderLockClient {
  set(
    key: string,
    value: string,
    px: 'PX',
    ttlMs: number,
    nx: 'NX',
  ): Promise<'OK' | null>;
  eval(script: string, numKeys: number, ...args: string[]): Promise<unknown>;
}

const RENEW_SCRIPT = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('pexpire', KEYS[1], ARGV[2])
end
return 0`;

const RELEASE_SCRIPT = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0`;

export const LEADER_LOCK_KEY = 'punishments:sync:leader';
export const LEADER_LOCK_TTL_MS = 10_000;

/// Лидерство опрашивающего экземпляра API (раздел 4.3): `SET key token NX PX`,
/// продление и освобождение — только compare-and-set по случайному токену
/// (Lua), чужой токен не трогается. Потеря токена означает остановку работы
/// до повторного захвата. Сервис синхронизации вызывает `acquireOrRenew`
/// непосредственно перед каждой записью зеркала, а транзакция записи ограничена
/// по времени (APPLY_TX_*), так что запись укладывается в TTL (10 с). Токен не
/// гарантирует отсутствие паузы процесса между проверкой и записью дольше TTL:
/// запись зеркала идемпотентна (upsert по `rowHash`), а двойной лидер на одном
/// шаге не портит данные (см. RISKS.md).
export class LeaderLock {
  private heldFlag = false;
  /// После `release()` блокировка больше не захватывается (остановка модуля).
  private closed = false;

  constructor(
    private readonly client: LeaderLockClient,
    private readonly key: string = LEADER_LOCK_KEY,
    private readonly ttlMs: number = LEADER_LOCK_TTL_MS,
    private readonly token: string = randomUUID(),
  ) {}

  get held(): boolean {
    return this.heldFlag;
  }

  /// Продлевает удерживаемую блокировку или пробует захватить новую.
  /// Продление пробуется всегда: после сбоя Redis своя блокировка могла
  /// остаться в нём (тот же токен) и не должна блокировать нас до TTL.
  /// Ошибка Redis трактуется как потеря лидерства (fail closed); после
  /// `release()` всегда `false`.
  async acquireOrRenew(): Promise<boolean> {
    if (this.closed) return false;
    try {
      const renewed = await this.client.eval(
        RENEW_SCRIPT,
        1,
        this.key,
        this.token,
        String(this.ttlMs),
      );
      if (Number(renewed) === 1) {
        this.heldFlag = !this.closed;
        return this.heldFlag;
      }
      this.heldFlag = false;
      const result = await this.client.set(
        this.key,
        this.token,
        'PX',
        this.ttlMs,
        'NX',
      );
      if (result === 'OK' && this.closed) {
        // Остановка пришла во время захвата: сразу отдаём блокировку.
        await this.client.eval(RELEASE_SCRIPT, 1, this.key, this.token);
        return false;
      }
      this.heldFlag = result === 'OK';
    } catch {
      this.heldFlag = false;
    }
    return this.heldFlag;
  }

  async release(): Promise<void> {
    this.closed = true;
    const wasHeld = this.heldFlag;
    this.heldFlag = false;
    if (!wasHeld) return;
    try {
      await this.client.eval(RELEASE_SCRIPT, 1, this.key, this.token);
    } catch {
      // Блокировка истечёт по TTL.
    }
  }
}
