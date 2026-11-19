import { BruteForceService } from './brute-force.service';
import { RedisService } from '../redis/redis.service';

function makeRedis() {
  const store = new Map<string, string>();
  const ttls = new Map<string, number>();
  const client = {
    get: jest.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
    incr: jest.fn((k: string) => {
      const n = Number(store.get(k) ?? 0) + 1;
      store.set(k, String(n));
      return Promise.resolve(n);
    }),
    expire: jest.fn(() => Promise.resolve(1)),
    set: jest.fn((k: string, v: string, _ex?: string, sec?: number) => {
      store.set(k, v);
      if (sec !== undefined) ttls.set(k, sec);
      return Promise.resolve('OK');
    }),
    del: jest.fn((...keys: string[]) => {
      keys.forEach((k) => {
        store.delete(k);
        ttls.delete(k);
      });
      return Promise.resolve(keys.length);
    }),
  };
  return { store, ttls, redis: { client } as unknown as RedisService };
}

describe('BruteForceService (ключ по /64 для IPv6)', () => {
  it('два адреса одной /64 делят счётчик, капчу и блокировку', async () => {
    const { redis, store } = makeRedis();
    const svc = new BruteForceService(redis);
    for (let i = 0; i < 3; i++) await svc.registerFailure('2001:db8:0:1::1');
    expect(await svc.requiresCaptcha('2001:db8:0:1:aaaa::2')).toBe(true);
    for (let i = 0; i < 7; i++) await svc.registerFailure('2001:db8:0:1::99');
    expect(await svc.isBlocked('2001:db8:0:1:1:2:3:4')).toBe(true);
    expect([...store.keys()].sort()).toEqual([
      'bruteforce:blocked:v6:2001:db8:0:1',
      'bruteforce:lastip:v6:2001:db8:0:1',
      'bruteforce:login:v6:2001:db8:0:1',
    ]);
    await svc.reset('2001:db8:0:1::5');
    expect(await svc.isBlocked('2001:db8:0:1::1')).toBe(false);
  });

  it('разные /64 и IPv4 не делят счётчик', async () => {
    const { redis } = makeRedis();
    const svc = new BruteForceService(redis);
    for (let i = 0; i < 10; i++) await svc.registerFailure('2001:db8:0:1::1');
    expect(await svc.isBlocked('2001:db8:0:2::1')).toBe(false);
    expect(await svc.requiresCaptcha('2001:db8:0:2::1')).toBe(false);
    expect(await svc.isBlocked('203.0.113.7')).toBe(false);
  });

  it('IPv4 и mapped IPv6 — один счётчик', async () => {
    const { redis } = makeRedis();
    const svc = new BruteForceService(redis);
    for (let i = 0; i < 3; i++) await svc.registerFailure('::ffff:203.0.113.7');
    expect(await svc.requiresCaptcha('203.0.113.7')).toBe(true);
  });

  it('сырой мусор: ключ raw:, разные строки — разные счётчики', async () => {
    const { redis, store } = makeRedis();
    const svc = new BruteForceService(redis);
    for (let i = 0; i < 10; i++) await svc.registerFailure('garbage-one');
    expect(await svc.isBlocked('garbage-one')).toBe(true);
    expect(await svc.isBlocked('garbage-two')).toBe(false);
    expect(await svc.requiresCaptcha('garbage-two')).toBe(false);
    expect(await svc.isBlocked('')).toBe(false);
    expect([...store.keys()].every((k) => /:raw:[0-9a-f]{16}$/.test(k))).toBe(
      true,
    );
    // Мусор не пишется как есть: в lastip — нормализованное значение.
    const lastValues = [...store.entries()]
      .filter(([k]) => k.startsWith('bruteforce:lastip:'))
      .map(([, v]) => v);
    expect(lastValues.length).toBeGreaterThan(0);
    expect(lastValues.every((v) => v === 'unknown')).toBe(true);
  });

  it('пусто и литерал unknown делят общий ключ unknown (осознанно)', async () => {
    const { redis, store } = makeRedis();
    const svc = new BruteForceService(redis);
    await svc.registerFailure('');
    await svc.registerFailure('unknown');
    expect([...store.keys()].sort()).toEqual([
      'bruteforce:lastip:unknown',
      'bruteforce:login:unknown',
    ]);
    expect(store.get('bruteforce:login:unknown')).toBe('2');
  });

  describe('lastip (Q21)', () => {
    it('пишет полный нормализованный IP по ключу подсети с TTL 900', async () => {
      const { redis, store, ttls } = makeRedis();
      const svc = new BruteForceService(redis);
      await svc.registerFailure('2001:db8:0:1::1');
      expect(store.get('bruteforce:lastip:v6:2001:db8:0:1')).toBe(
        '2001:db8:0:1::1',
      );
      expect(ttls.get('bruteforce:lastip:v6:2001:db8:0:1')).toBe(900);
    });

    it('соседи по /64 пишут один ключ, значение — последний адрес', async () => {
      const { redis, store } = makeRedis();
      const svc = new BruteForceService(redis);
      await svc.registerFailure('2001:db8:0:1::1');
      await svc.registerFailure('2001:db8:0:1::2');
      const lastKeys = [...store.keys()].filter((k) =>
        k.startsWith('bruteforce:lastip:'),
      );
      expect(lastKeys).toEqual(['bruteforce:lastip:v6:2001:db8:0:1']);
      expect(store.get(lastKeys[0])).toBe('2001:db8:0:1::2');
    });

    it('IPv4 и mapped IPv6 — нормализованный IPv4', async () => {
      const { redis, store } = makeRedis();
      const svc = new BruteForceService(redis);
      await svc.registerFailure('::ffff:203.0.113.7');
      expect(store.get('bruteforce:lastip:203.0.113.7')).toBe('203.0.113.7');
    });

    it('TTL обновляется при каждой неудаче и покрывает блокировку', async () => {
      const { redis, ttls } = makeRedis();
      const svc = new BruteForceService(redis);
      for (let i = 0; i < 10; i++) await svc.registerFailure('203.0.113.7');
      expect(ttls.get('bruteforce:lastip:203.0.113.7')).toBe(900);
      expect(ttls.get('bruteforce:blocked:203.0.113.7')).toBe(900);
      const setCalls = (redis.client.set as jest.Mock).mock.calls.filter(
        (c: unknown[]) => String(c[0]).startsWith('bruteforce:lastip:'),
      );
      expect(setCalls).toHaveLength(10);
    });

    it('reset удаляет lastip вместе со счётчиком и блокировкой', async () => {
      const { redis, store } = makeRedis();
      const svc = new BruteForceService(redis);
      for (let i = 0; i < 10; i++) await svc.registerFailure('2001:db8:0:1::1');
      await svc.reset('2001:db8:0:1::7');
      expect([...store.keys()]).toEqual([]);
    });

    it('шаблоны login:* и blocked:* не захватывают lastip', () => {
      const lastip = 'bruteforce:lastip:v6:2001:db8:0:1';
      expect(lastip.startsWith('bruteforce:login:')).toBe(false);
      expect(lastip.startsWith('bruteforce:blocked:')).toBe(false);
    });
  });
});
