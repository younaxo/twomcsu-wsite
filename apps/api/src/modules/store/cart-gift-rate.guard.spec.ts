import { ExecutionContext, HttpException } from '@nestjs/common';
import { CartGiftRateGuard, CART_GIFT_LIMITS } from './cart-gift-rate.guard';
import { RedisService } from '../redis/redis.service';

/// Фиксированное окно в памяти вместо Redis: эмулирует multi().set().incr().ttl().
function fakeRedis(opts: { fail?: boolean } = {}) {
  const counts = new Map<string, number>();
  const client = {
    multi() {
      const ops: string[] = [];
      const chain = {
        set(key: string) {
          if (!counts.has(key)) counts.set(key, 0);
          ops.push('set');
          return chain;
        },
        incr(key: string) {
          counts.set(key, (counts.get(key) ?? 0) + 1);
          ops.push(String(counts.get(key)));
          return chain;
        },
        ttl() {
          ops.push('ttl');
          return chain;
        },
        async exec() {
          if (opts.fail) throw new Error('redis down');
          const out: [null, unknown][] = [];
          for (const op of ops) {
            if (op === 'set') out.push([null, 'OK']);
            else if (op === 'ttl') out.push([null, 42]);
            else out.push([null, Number(op)]);
          }
          return out;
        },
      };
      return chain;
    },
  };
  return { client, counts } as unknown as RedisService & {
    counts: Map<string, number>;
  };
}

function ctx(body: unknown, userId = 'u1', ip = '203.0.113.7') {
  const headers: Record<string, string> = {};
  const res = { setHeader: (k: string, v: string) => (headers[k] = v) };
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({ user: { id: userId }, body, ip }),
      getResponse: () => res,
    }),
  } as unknown as ExecutionContext;
  return { context, headers };
}

async function status(guard: CartGiftRateGuard, c: ExecutionContext) {
  try {
    await guard.canActivate(c);
    return 200;
  } catch (e) {
    return (e as HttpException).getStatus();
  }
}

describe('CartGiftRateGuard (Q81)', () => {
  it('операции без подарка не считаются и не ограничиваются', async () => {
    const redis = fakeRedis();
    const guard = new CartGiftRateGuard(redis);
    for (let i = 0; i < 50; i++) {
      expect(await status(guard, ctx({ quantity: 1 }).context)).toBe(200);
      expect(await status(guard, ctx({ giftToUsername: '' }).context)).toBe(
        200,
      );
    }
    expect(redis.counts.size).toBe(0);
  });

  it('11-я операция с подарком — 429 с Retry-After и кодом', async () => {
    const guard = new CartGiftRateGuard(fakeRedis());
    for (let i = 0; i < CART_GIFT_LIMITS.user.perMinute; i++) {
      expect(await status(guard, ctx({ giftToUsername: 'Bob' }).context)).toBe(
        200,
      );
    }
    const { context, headers } = ctx({ giftToUsername: 'Bob' });
    let error: HttpException | null = null;
    try {
      await guard.canActivate(context);
    } catch (e) {
      error = e as HttpException;
    }
    expect(error?.getStatus()).toBe(429);
    expect((error?.getResponse() as { code: string }).code).toBe(
      'CART_GIFT_RATE_LIMITED',
    );
    expect(headers['Retry-After']).toBe('42');
  });

  it('другой пользователь с другого IP не затронут', async () => {
    const guard = new CartGiftRateGuard(fakeRedis());
    for (let i = 0; i < 11; i++) {
      await status(guard, ctx({ giftToUsername: 'Bob' }).context);
    }
    expect(
      await status(
        guard,
        ctx({ giftToUsername: 'Bob' }, 'u2', '198.51.100.9').context,
      ),
    ).toBe(200);
  });

  it('потолок IP срабатывает при обходе через много аккаунтов', async () => {
    const guard = new CartGiftRateGuard(fakeRedis());
    let last = 200;
    for (let i = 0; i <= CART_GIFT_LIMITS.ip.perMinute; i++) {
      last = await status(
        guard,
        ctx({ giftToUsername: 'Bob' }, `u${i}`).context,
      );
    }
    expect(last).toBe(429);
  });

  it('Redis недоступен — 503 (fail closed)', async () => {
    const guard = new CartGiftRateGuard(fakeRedis({ fail: true }));
    expect(await status(guard, ctx({ giftToUsername: 'Bob' }).context)).toBe(
      503,
    );
  });
});
