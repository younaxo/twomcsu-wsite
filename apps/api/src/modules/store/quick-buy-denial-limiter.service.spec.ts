import { QuickBuyDenialLimiter } from './quick-buy-denial-limiter.service';

function setup(opts: { count?: string | null; fail?: boolean }) {
  const client = {
    eval: jest.fn(async () => {
      if (opts.fail) throw new Error('down');
      return 1;
    }),
    get: jest.fn(async () => {
      if (opts.fail) throw new Error('down');
      return opts.count ?? null;
    }),
    ttl: jest.fn().mockResolvedValue(120),
  };
  const config = { get: jest.fn(() => 'test-secret') };
  return {
    client,
    limiter: new QuickBuyDenialLimiter({ client } as never, config as never),
  };
}

describe('QuickBuyDenialLimiter (ADR-0186 Р1)', () => {
  it('меньше 30 отказов — пропускает', async () => {
    const { limiter } = setup({ count: '29' });
    await expect(limiter.assertAllowed('1.2.3.4')).resolves.toBeUndefined();
  });

  it('30 отказов — 429 quick_buy_rate_limited с retryAfter', async () => {
    const { limiter } = setup({ count: '30' });
    await expect(limiter.assertAllowed('1.2.3.4')).rejects.toMatchObject({
      status: 429,
      response: { code: 'quick_buy_rate_limited', retryAfter: 120 },
    });
  });

  it('Redis недоступен — 503 (fail closed)', async () => {
    const { limiter } = setup({ fail: true });
    await expect(limiter.assertAllowed('1.2.3.4')).rejects.toMatchObject({
      status: 503,
    });
  });

  it('запись отказа не бросает при сбое Redis', async () => {
    const { limiter } = setup({ fail: true });
    await expect(limiter.recordDenial('1.2.3.4')).resolves.toBeUndefined();
  });

  it('запись отказа: один атомарный eval (INCR + EXPIRE), ключ — HMAC, не IP', async () => {
    const { limiter, client } = setup({});
    await limiter.recordDenial('1.2.3.4');
    expect(client.eval).toHaveBeenCalledTimes(1);
    const [script, numKeys, key, ttl] = client.eval.mock
      .calls[0] as unknown as [string, number, string, number];
    expect(script).toContain('INCR');
    expect(script).toContain('EXPIRE');
    expect(numKeys).toBe(1);
    expect(ttl).toBe(3600);
    expect(key).toMatch(/^store:qb:deny:[0-9a-f]{32}$/);
    expect(key).not.toContain('1.2.3.4');
  });

  it('адреса одной подсети IPv6 /64 дают один ключ, другой /64 — другой', async () => {
    const { limiter, client } = setup({});
    await limiter.recordDenial('2001:db8:1:2:aaaa:bbbb:cccc:dddd');
    await limiter.recordDenial('2001:db8:1:2:1111:2222:3333:4444');
    await limiter.recordDenial('2001:db8:1:3::1');
    const keys = client.eval.mock.calls.map((c) => (c as unknown[])[2]);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[0]);
  });
});
