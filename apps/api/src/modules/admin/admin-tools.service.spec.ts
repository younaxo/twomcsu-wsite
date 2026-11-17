import { PrismaService } from '../prisma/prisma.service';
import { AdminToolsService } from './admin-tools.service';

describe('AdminToolsService.getSiteSettings', () => {
  it('не отдаёт deprecated-поле requireAdmin2fa (Q22/Q44)', async () => {
    const row = {
      id: 'singleton',
      siteName: 'TwoMC',
      registrationEnabled: true,
      requireAdmin2fa: true,
    };
    const prisma = {
      siteSettings: { findFirst: jest.fn().mockResolvedValue(row) },
    } as unknown as PrismaService;
    const service = new AdminToolsService(prisma, {} as never, {} as never);
    const res = await service.getSiteSettings();
    expect(res).not.toHaveProperty('requireAdmin2fa');
    expect(res).toMatchObject({ siteName: 'TwoMC', registrationEnabled: true });
  });

  it('updateSiteSettings не отдаёт requireAdmin2fa ни в ответе, ни в аудите', async () => {
    const row = { id: 'singleton', siteName: 'A', requireAdmin2fa: true };
    const updated = { ...row, siteName: 'B' };
    const prisma = {
      siteSettings: {
        findFirst: jest.fn().mockResolvedValue(row),
        update: jest.fn().mockResolvedValue(updated),
      },
    } as unknown as PrismaService;
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new AdminToolsService(prisma, {} as never, audit as never);
    const res = await service.updateSiteSettings(
      { siteName: 'B' } as never,
      'admin-1',
    );
    expect(res).not.toHaveProperty('requireAdmin2fa');
    expect(res).toMatchObject({ siteName: 'B' });
    const changes = audit.log.mock.calls[0][0].changes;
    expect(changes.before).not.toHaveProperty('requireAdmin2fa');
    expect(changes.after).not.toHaveProperty('requireAdmin2fa');
    expect(changes.after).toMatchObject({ siteName: 'B' });
  });

  it('updateIpWhitelist не отдаёт requireAdmin2fa (Q22/Q44)', async () => {
    const row = {
      id: 'singleton',
      ipWhitelist: [] as string[],
      requireAdmin2fa: true,
    };
    const updated = { ...row, ipWhitelist: ['10.0.0.1'] };
    const prisma = {
      siteSettings: {
        findFirst: jest.fn().mockResolvedValue(row),
        update: jest.fn().mockResolvedValue(updated),
      },
    } as unknown as PrismaService;
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new AdminToolsService(prisma, {} as never, audit as never);
    const res = await service.updateIpWhitelist(
      { ips: ['10.0.0.1'] } as never,
      'admin-1',
    );
    expect(res).not.toHaveProperty('requireAdmin2fa');
    expect(res).toMatchObject({ id: 'singleton', ipWhitelist: ['10.0.0.1'] });
  });
});

describe('AdminToolsService.listSuspiciousActivity (lastIp, Q21)', () => {
  function makeService(
    store: Record<string, string>,
    ttls: Record<string, number> = {},
  ) {
    const redis = {
      client: {
        scan: jest.fn((_cursor: string, _m: string, pattern: string) => {
          const prefix = pattern.replace('*', '');
          return Promise.resolve([
            '0',
            Object.keys(store).filter((k) => k.startsWith(prefix)),
          ]);
        }),
        get: jest.fn((k: string) => Promise.resolve(store[k] ?? null)),
        mget: jest.fn((keys: string[]) =>
          Promise.resolve(keys.map((k) => store[k] ?? null)),
        ),
        ttl: jest.fn((k: string) => Promise.resolve(ttls[k] ?? -1)),
      },
    };
    return new AdminToolsService({} as never, redis as never, {} as never);
  }

  it('отдаёт ip (ключ подсети) и lastIp (полный адрес) для IPv6', async () => {
    const service = makeService({
      'bruteforce:login:v6:2001:db8:0:1': '4',
      'bruteforce:lastip:v6:2001:db8:0:1': '2001:db8:0:1::abcd',
    });
    expect(await service.listSuspiciousActivity()).toEqual([
      {
        ip: 'v6:2001:db8:0:1',
        lastIp: '2001:db8:0:1::abcd',
        failedAttempts: 4,
        isBlocked: false,
        blockedTtlSeconds: null,
      },
    ]);
  });

  it('lastIp = null, если ключ lastip истёк или отсутствует; блокировка сохраняется', async () => {
    const service = makeService(
      {
        'bruteforce:login:203.0.113.7': '10',
        'bruteforce:blocked:203.0.113.7': '1',
      },
      { 'bruteforce:blocked:203.0.113.7': 120 },
    );
    expect(await service.listSuspiciousActivity()).toEqual([
      {
        ip: '203.0.113.7',
        lastIp: null,
        failedAttempts: 10,
        isBlocked: true,
        blockedTtlSeconds: 120,
      },
    ]);
  });

  it('ключ lastip сам не создаёт строку в списке', async () => {
    const service = makeService({
      'bruteforce:lastip:203.0.113.9': '203.0.113.9',
    });
    expect(await service.listSuspiciousActivity()).toEqual([]);
  });

  describe('пачки MGET по 100 ключей', () => {
    function storeFor(count: number): Record<string, string> {
      const store: Record<string, string> = {};
      for (let i = 0; i < count; i += 1) {
        const key = `198.51.100.${i}`;
        store[`bruteforce:login:${key}`] = '3';
        // lastip есть у всех, кроме каждого 7-го: проверка соответствия индексов.
        if (i % 7 !== 0) store[`bruteforce:lastip:${key}`] = `full-${i}`;
      }
      return store;
    }

    function mgetSizes(service: AdminToolsService): number[] {
      const redis = (
        service as unknown as {
          redis: { client: { mget: jest.Mock } };
        }
      ).redis;
      return redis.client.mget.mock.calls.map((c: [string[]]) => c[0].length);
    }

    it.each([
      [100, [100]],
      [101, [100, 1]],
      [250, [100, 100, 50]],
    ])(
      '%i ключей подсетей -> размеры пачек %j, lastIp соответствует ключу',
      async (count, sizes) => {
        const service = makeService(storeFor(count));
        const result = await service.listSuspiciousActivity();
        expect(mgetSizes(service)).toEqual(sizes);
        expect(result).toHaveLength(count);
        for (const row of result) {
          const i = Number(row.ip.split('.')[3]);
          expect(row.lastIp).toBe(i % 7 === 0 ? null : `full-${i}`);
        }
      },
    );
  });
});
