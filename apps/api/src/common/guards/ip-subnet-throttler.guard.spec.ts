import { Reflector } from '@nestjs/core';
import type { ThrottlerModuleOptions } from '@nestjs/throttler';
import { IpSubnetThrottlerGuard } from './ip-subnet-throttler.guard';

function makeGuard() {
  const options: ThrottlerModuleOptions = [{ ttl: 60_000, limit: 100 }];
  const storage = { increment: jest.fn() };
  return new IpSubnetThrottlerGuard(options, storage as never, new Reflector());
}

function tracker(req: Record<string, unknown>): Promise<string> {
  const guard = makeGuard() as unknown as {
    getTracker(r: Record<string, unknown>): Promise<string>;
  };
  return guard.getTracker(req);
}

describe('IpSubnetThrottlerGuard.getTracker (ключ по /64, Q21)', () => {
  it('IPv4 — полный адрес как есть', async () => {
    expect(await tracker({ ip: '203.0.113.7' })).toBe('203.0.113.7');
  });

  it('IPv4-mapped IPv6 совпадает с обычным IPv4', async () => {
    expect(await tracker({ ip: '::ffff:203.0.113.7' })).toBe('203.0.113.7');
  });

  it('два адреса одной /64 дают один ключ', async () => {
    const a = await tracker({ ip: '2001:db8:0:1::1' });
    const b = await tracker({ ip: '2001:db8:0:1:aaaa:bbbb:cccc:dddd' });
    expect(a).toBe('v6:2001:db8:0:1');
    expect(b).toBe(a);
  });

  it('адреса из разных /64 дают разные ключи', async () => {
    const a = await tracker({ ip: '2001:db8:0:1::1' });
    const b = await tracker({ ip: '2001:db8:0:2::1' });
    expect(a).not.toBe(b);
  });

  it('без req.ip берётся адрес сокета', async () => {
    expect(
      await tracker({ socket: { remoteAddress: '2001:db8:0:1::9' } }),
    ).toBe('v6:2001:db8:0:1');
  });

  it('пусто — общий ключ unknown', async () => {
    expect(await tracker({})).toBe('unknown');
    expect(await tracker({ ip: '' })).toBe('unknown');
    expect(await tracker({ ip: 'unknown' })).toBe('unknown');
    expect(await tracker({ ip: 42 })).toBe('unknown');
  });

  it('мусор — ключ raw:, разные строки разные, без исключения', async () => {
    const a = await tracker({ ip: 'not-an-ip' });
    const b = await tracker({ ip: 'other-garbage' });
    expect(a).toMatch(/^raw:[0-9a-f]{16}$/);
    expect(b).toMatch(/^raw:[0-9a-f]{16}$/);
    expect(a).not.toBe(b);
  });
});
