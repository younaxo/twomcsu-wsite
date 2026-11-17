import {
  LEADER_LOCK_TTL_MS,
  LeaderLock,
  LeaderLockClient,
} from './punishments-leader-lock';
import {
  APPLY_TX_MAX_WAIT_MS,
  APPLY_TX_TIMEOUT_MS,
} from './punishment-mirror.store';

/// Redis в памяти: различает скрипты продления и освобождения по тексту.
class FakeRedis implements LeaderLockClient {
  data = new Map<string, string>();
  failEval = false;
  evalCalls = 0;

  async set(
    key: string,
    value: string,
    _px: 'PX',
    _ttl: number,
    _nx: 'NX',
  ): Promise<'OK' | null> {
    if (this.data.has(key)) return null;
    this.data.set(key, value);
    return 'OK';
  }

  async eval(script: string, _n: number, ...args: string[]): Promise<unknown> {
    this.evalCalls += 1;
    if (this.failEval) throw new Error('redis down');
    const [key, token] = args;
    const current = this.data.get(key);
    if (script.includes('pexpire')) return current === token ? 1 : 0;
    if (current === token) {
      this.data.delete(key);
      return 1;
    }
    return 0;
  }
}

describe('LeaderLock', () => {
  it('захватывает, продлевает и освобождает только свой токен', async () => {
    const redis = new FakeRedis();
    const a = new LeaderLock(redis, 'k', 10_000, 'token-a');
    const b = new LeaderLock(redis, 'k', 10_000, 'token-b');
    expect(await a.acquireOrRenew()).toBe(true);
    expect(await b.acquireOrRenew()).toBe(false);
    expect(await a.acquireOrRenew()).toBe(true);
    await b.release();
    expect(redis.data.get('k')).toBe('token-a');
    await a.release();
    expect(redis.data.has('k')).toBe(false);
  });

  it('после release() блокировка больше не захватывается (heartbeat после остановки)', async () => {
    const redis = new FakeRedis();
    const lock = new LeaderLock(redis, 'k', 10_000, 'token-a');
    expect(await lock.acquireOrRenew()).toBe(true);
    await lock.release();
    expect(await lock.acquireOrRenew()).toBe(false);
    expect(lock.held).toBe(false);
    expect(redis.data.has('k')).toBe(false);
  });

  it('release() без захвата тоже закрывает блокировку', async () => {
    const redis = new FakeRedis();
    const lock = new LeaderLock(redis, 'k', 10_000, 'token-a');
    await lock.release();
    expect(await lock.acquireOrRenew()).toBe(false);
    expect(redis.data.size).toBe(0);
  });

  it('сбой Redis при продлении: fail closed, затем своя блокировка возвращается без ожидания TTL', async () => {
    const redis = new FakeRedis();
    const lock = new LeaderLock(redis, 'k', 10_000, 'token-a');
    expect(await lock.acquireOrRenew()).toBe(true);
    redis.failEval = true;
    expect(await lock.acquireOrRenew()).toBe(false);
    expect(lock.held).toBe(false);
    redis.failEval = false;
    // Ключ с нашим токеном остался в Redis: продление возвращает лидерство.
    expect(await lock.acquireOrRenew()).toBe(true);
  });

  it('чужая блокировка не отбирается и не продлевается', async () => {
    const redis = new FakeRedis();
    redis.data.set('k', 'other');
    const lock = new LeaderLock(redis, 'k', 10_000, 'token-a');
    expect(await lock.acquireOrRenew()).toBe(false);
    expect(redis.data.get('k')).toBe('other');
  });
});

describe('согласование транзакции записи с TTL блокировки (F4)', () => {
  it('ожидание соединения плюс транзакция укладываются в TTL с запасом', () => {
    expect(APPLY_TX_MAX_WAIT_MS + APPLY_TX_TIMEOUT_MS).toBeLessThan(
      LEADER_LOCK_TTL_MS,
    );
    expect(
      LEADER_LOCK_TTL_MS - (APPLY_TX_MAX_WAIT_MS + APPLY_TX_TIMEOUT_MS),
    ).toBeGreaterThanOrEqual(1000);
  });
});
