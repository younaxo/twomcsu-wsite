import { BruteForceService } from './brute-force.service';
import { RedisService } from '../redis/redis.service';

function makeRedis() {
  const store = new Map<string, string>();
  const client = {
    get: jest.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
    incr: jest.fn((k: string) => {
      const n = Number(store.get(k) ?? 0) + 1;
      store.set(k, String(n));
      return Promise.resolve(n);
    }),
    expire: jest.fn(() => Promise.resolve(1)),
    set: jest.fn((k: string, v: string) => {
      store.set(k, v);
      return Promise.resolve('OK');
    }),
    del: jest.fn((...keys: string[]) => {
      keys.forEach((k) => store.delete(k));
      return Promise.resolve(keys.length);
    }),
  };
  return { store, redis: { client } as unknown as RedisService };
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
});
