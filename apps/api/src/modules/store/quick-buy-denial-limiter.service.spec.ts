import { QuickBuyDenialLimiter } from './quick-buy-denial-limiter.service';

function setup(opts: { count?: string | null; fail?: boolean }) {
  const exec = jest.fn().mockResolvedValue([]);
  const chain = { set: jest.fn(), incr: jest.fn(), exec };
  chain.set.mockReturnValue(chain);
  chain.incr.mockReturnValue(chain);
  const client = {
    get: jest.fn(async () => {
      if (opts.fail) throw new Error('down');
      return opts.count ?? null;
    }),
    ttl: jest.fn().mockResolvedValue(120),
    multi: jest.fn(() => {
      if (opts.fail) throw new Error('down');
      return chain;
    }),
  };
  return { client, chain, limiter: new QuickBuyDenialLimiter({ client } as never) };
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

  it('запись отказа: SET NX EX + INCR', async () => {
    const { limiter, chain } = setup({});
    await limiter.recordDenial('1.2.3.4');
    expect(chain.set).toHaveBeenCalledWith(
      expect.stringContaining('store:qb:deny:'),
      '0',
      'EX',
      3600,
      'NX',
    );
    expect(chain.incr).toHaveBeenCalled();
  });
});
