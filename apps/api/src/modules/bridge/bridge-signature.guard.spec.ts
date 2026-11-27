import { ExecutionContext, HttpException, Logger } from '@nestjs/common';
import {
  FakeRedisClient,
  NONCE_A,
  SLUG,
  TEST_MASTER,
  TEST_MASTER_SECRET,
  batchBody,
  fakeRedisService,
  makeEvent,
  makeServer,
  signedHeaders,
} from '../../../test/support/bridge-support';
import { BridgeRedisService } from './bridge-redis.service';
import { BridgeSignatureGuard } from './bridge-signature.guard';
import { BridgeConfig } from './bridge.config';
import { BridgeRequest } from './bridge.types';

const BODY = batchBody([makeEvent('bridge.hello', { pluginVersion: '1.0.0' })]);

function config(over: Partial<BridgeConfig> = {}): BridgeConfig {
  return {
    enabled: true,
    masterSecret: TEST_MASTER,
    timestampWindowS: 60,
    maxBodyBytes: 262_144,
    keyOverlapDays: 7,
    applyLatencyLimitMs: 2000,
    bodyReadTimeoutMs: 10000,
    deliveryEnabled: false,
    statsEnabled: false,
    ...over,
  };
}

interface Setup {
  guard: BridgeSignatureGuard;
  redisClient: FakeRedisClient;
  findUnique: jest.Mock;
}

function setup(
  cfg: BridgeConfig = config(),
  server: ReturnType<typeof makeServer> | null = makeServer(),
): Setup {
  const redisClient = new FakeRedisClient();
  const redis = new BridgeRedisService(fakeRedisService(redisClient));
  const findUnique = jest.fn().mockResolvedValue(server);
  const prisma = { bridgeServer: { findUnique } };
  const guard = new BridgeSignatureGuard(cfg, prisma as never, redis);
  return { guard, redisClient, findUnique };
}

interface ReqOptions {
  path?: string;
  method?: string;
  body?: Buffer;
  headers?: Record<string, string | undefined>;
  signedWith?: Parameters<typeof signedHeaders>[0];
  omitRawBody?: boolean;
  url?: string;
}

function makeReq(opts: ReqOptions = {}): BridgeRequest {
  const method = opts.method ?? 'POST';
  const path = opts.path ?? '/bridge/v1/events';
  const body = opts.body ?? (method === 'POST' ? BODY : Buffer.alloc(0));
  const headers: Record<string, string | undefined> = {
    ...signedHeaders({ method, path, body, ...opts.signedWith }),
    ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
    ...opts.headers,
  };
  for (const k of Object.keys(headers)) {
    if (headers[k] === undefined) delete headers[k];
  }
  return {
    originalUrl: opts.url ?? path,
    method,
    headers,
    rawBody: opts.omitRawBody ? undefined : body,
    ip: '203.0.113.9',
    socket: { remoteAddress: '203.0.113.9' },
  } as unknown as BridgeRequest;
}

function context(req: BridgeRequest, res: { setHeader: jest.Mock }) {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as unknown as ExecutionContext;
}

async function run(guard: BridgeSignatureGuard, req: BridgeRequest) {
  const res = { setHeader: jest.fn() };
  try {
    await guard.canActivate(context(req, res));
    return { ok: true as const, res, status: 200, body: null as unknown };
  } catch (err) {
    if (!(err instanceof HttpException)) throw err;
    return {
      ok: false as const,
      res,
      status: err.getStatus(),
      body: err.getResponse(),
    };
  }
}

const UNAUTH = { error: 'unauthorized' };

describe('BridgeSignatureGuard: fail-closed (503)', () => {
  it.each([
    ['выключен', config({ enabled: false })],
    ['нет секрета', config({ masterSecret: null })],
    ['выключен и нет секрета', config({ enabled: false, masterSecret: null })],
  ])('%s: 503 без деталей и без обращений к БД и Redis', async (_n, cfg) => {
    const { guard, findUnique, redisClient } = setup(cfg);
    const res = await run(guard, makeReq());
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'unavailable' });
    expect(findUnique).not.toHaveBeenCalled();
    expect(redisClient.calls).toEqual([]);
  });

  it('503 и для handshake', async () => {
    const { guard } = setup(config({ enabled: false }));
    const res = await run(
      guard,
      makeReq({ method: 'GET', path: '/bridge/v1/handshake' }),
    );
    expect(res.status).toBe(503);
  });
});

describe('BridgeSignatureGuard: успешные запросы', () => {
  it('POST /events: контекст с slug из ключа, нонс записан после подписи', async () => {
    const { guard, redisClient } = setup();
    const req = makeReq({ signedWith: { nonce: NONCE_A } });
    const res = await run(guard, req);
    expect(res.ok).toBe(true);
    expect(req.bridge?.slug).toBe(SLUG);
    expect(req.bridge?.keyId).toBe('survival.1');
    expect(req.bridge?.generation).toBe(1);
    expect(redisClient.store.get(`bridge:nonce:survival.1:${NONCE_A}`)).toBe(
      '1',
    );
    expect(redisClient.ttls.get(`bridge:nonce:survival.1:${NONCE_A}`)).toBe(
      180,
    );
  });

  it('GET /handshake без тела', async () => {
    const { guard } = setup();
    const req = makeReq({ method: 'GET', path: '/bridge/v1/handshake' });
    expect((await run(guard, req)).ok).toBe(true);
  });

  it('время на границе окна принимается', async () => {
    const { guard } = setup();
    const req = makeReq({ signedWith: { nowMs: Date.now() - 55_000 } });
    expect((await run(guard, req)).ok).toBe(true);
  });

  it('capabilities сервера попадают в контекст', async () => {
    const { guard } = setup(
      config(),
      makeServer({ capabilities: { punishments: false } }),
    );
    const req = makeReq();
    await run(guard, req);
    expect(req.bridge?.capabilities.has('punishments')).toBe(false);
  });
});

describe('BridgeSignatureGuard: формат проверяется ДО БД и Redis', () => {
  const sig = signedHeaders({ body: BODY })['x-twomc-signature'];
  it.each([
    [
      'key-id с большой буквой',
      { headers: { 'x-twomc-key-id': 'Survival.1' } },
    ],
    ['key-id без поколения', { headers: { 'x-twomc-key-id': 'survival' } }],
    ['key-id с точкой в slug', { headers: { 'x-twomc-key-id': 'a.b.1' } }],
    [
      'key-id длиннее 32 до точки',
      { headers: { 'x-twomc-key-id': `${'a'.repeat(33)}.1` } },
    ],
    ['key-id с поколением 0', { headers: { 'x-twomc-key-id': 'survival.0' } }],
    [
      'key-id с поколением 01',
      { headers: { 'x-twomc-key-id': 'survival.01' } },
    ],
    ['key-id slug из одного символа', { headers: { 'x-twomc-key-id': 'a.1' } }],
    ['key-id отсутствует', { headers: { 'x-twomc-key-id': undefined } }],
    ['timestamp 9 цифр', { headers: { 'x-twomc-timestamp': '179491680' } }],
    ['timestamp 11 цифр', { headers: { 'x-twomc-timestamp': '17949168000' } }],
    ['timestamp с буквой', { headers: { 'x-twomc-timestamp': '17949168a0' } }],
    ['подпись 63 символа', { headers: { 'x-twomc-signature': sig.slice(1) } }],
    ['подпись 65 символов', { headers: { 'x-twomc-signature': `${sig}0` } }],
    ['подпись не hex', { headers: { 'x-twomc-signature': 'z'.repeat(64) } }],
    ['подпись отсутствует', { headers: { 'x-twomc-signature': undefined } }],
    ['нонс 21 символ', { headers: { 'x-twomc-nonce': 'A'.repeat(21) } }],
    ['нонс 44 символа', { headers: { 'x-twomc-nonce': 'A'.repeat(44) } }],
    [
      'нонс с недопустимым символом',
      { headers: { 'x-twomc-nonce': `${'A'.repeat(21)}+` } },
    ],
    ['протокол не число', { headers: { 'x-twomc-protocol': 'one' } }],
    ['протокол отсутствует', { headers: { 'x-twomc-protocol': undefined } }],
    ['query в URL', { url: '/bridge/v1/events?x=1' }],
    ['пустой query', { url: '/bridge/v1/events?' }],
    ['Content-Encoding', { headers: { 'content-encoding': 'gzip' } }],
    ['путь в другом регистре', { url: '/Bridge/v1/events' }],
    ['завершающий слэш', { url: '/bridge/v1/events/' }],
    ['чужой путь', { url: '/bridge/v1/punishments/snapshot' }],
    ['двойной слэш', { url: '/bridge//v1/events' }],
    ['метод не подходит пути', { method: 'GET', path: '/bridge/v1/events' }],
    ['не JSON Content-Type', { headers: { 'content-type': 'text/plain' } }],
    ['нет Content-Type у POST', { headers: { 'content-type': undefined } }],
    ['нет сырого тела', { omitRawBody: true }],
  ] as Array<[string, ReqOptions]>)(
    '%s: 401 без обращений',
    async (_n, opts) => {
      const { guard, findUnique, redisClient } = setup();
      const res = await run(guard, makeReq(opts));
      expect(res.status).toBe(401);
      expect(res.body).toEqual(UNAUTH);
      expect(findUnique).not.toHaveBeenCalled();
      expect(redisClient.calls).toEqual([]);
    },
  );
});

describe('BridgeSignatureGuard: размер и версия', () => {
  it('тело больше лимита - 413', async () => {
    const { guard } = setup(config({ maxBodyBytes: 100 }));
    const res = await run(guard, makeReq());
    expect(res.status).toBe(413);
  });

  it('Content-Length больше лимита - 413', async () => {
    const { guard } = setup();
    const res = await run(
      guard,
      makeReq({ headers: { 'content-length': '999999' } }),
    );
    expect(res.status).toBe(413);
  });

  it('мажорная версия 2 - 426, нонс не пишется', async () => {
    const { guard, redisClient } = setup();
    const res = await run(guard, makeReq({ signedWith: { protocol: '2' } }));
    expect(res.status).toBe(426);
    expect(redisClient.keysWithPrefix('bridge:nonce:')).toEqual([]);
  });
});

describe('BridgeSignatureGuard: отказы 401 и нонс', () => {
  it('неизвестный сервер', async () => {
    const { guard, redisClient } = setup(config(), null);
    const res = await run(guard, makeReq());
    expect(res.status).toBe(401);
    expect(res.body).toEqual(UNAUTH);
    expect(redisClient.keysWithPrefix('bridge:nonce:')).toEqual([]);
  });

  it('REVOKED - немедленный отказ', async () => {
    const { guard, redisClient } = setup(
      config(),
      makeServer({ status: 'REVOKED' }),
    );
    const res = await run(guard, makeReq());
    expect(res.status).toBe(401);
    expect(redisClient.keysWithPrefix('bridge:nonce:')).toEqual([]);
  });

  it.each([
    ['прошлое за окном', -61_000],
    ['будущее за окном', 61_000],
  ])('время: %s - 401, нонс не пишется', async (_n, delta) => {
    const { guard, redisClient } = setup();
    const res = await run(
      guard,
      makeReq({ signedWith: { nowMs: Date.now() + delta } }),
    );
    expect(res.status).toBe(401);
    expect(res.body).toEqual(UNAUTH);
    expect(redisClient.keysWithPrefix('bridge:nonce:')).toEqual([]);
  });

  it('неверная подпись (другой мастер) - 401, нонс не пишется', async () => {
    const { guard, redisClient } = setup();
    const res = await run(
      guard,
      makeReq({
        signedWith: {
          master: Buffer.from('another-synthetic-master-secret-0000000'),
        },
      }),
    );
    expect(res.status).toBe(401);
    expect(res.body).toEqual(UNAUTH);
    expect(redisClient.keysWithPrefix('bridge:nonce:')).toEqual([]);
  });

  it('подпись над другим телом или путём - 401', async () => {
    const { guard } = setup();
    const other = batchBody([makeEvent('bridge.hello', {})]);
    const req = makeReq();
    (req as { rawBody?: Buffer }).rawBody = other;
    expect((await run(guard, req)).status).toBe(401);
  });

  it('повтор нонса - 401', async () => {
    const { guard } = setup();
    const first = await run(guard, makeReq({ signedWith: { nonce: NONCE_A } }));
    const replay = await run(
      guard,
      makeReq({ signedWith: { nonce: NONCE_A } }),
    );
    expect(first.ok).toBe(true);
    expect(replay.status).toBe(401);
    expect(replay.body).toEqual(UNAUTH);
  });

  it('тот же нонс другого ключа не конфликтует', async () => {
    const { guard } = setup();
    expect(
      (await run(guard, makeReq({ signedWith: { nonce: NONCE_A } }))).ok,
    ).toBe(true);
    const other = setup(config(), makeServer({ slug: 'creative' }));
    const req = makeReq({ signedWith: { slug: 'creative', nonce: NONCE_A } });
    expect((await run(other.guard, req)).ok).toBe(true);
  });

  it('все отказы 401 имеют одинаковое тело', async () => {
    const bodies = new Set<string>();
    const cases: Array<[Setup, ReqOptions]> = [
      [setup(config(), null), {}],
      [setup(config(), makeServer({ status: 'REVOKED' })), {}],
      [setup(), { signedWith: { nowMs: Date.now() - 120_000 } }],
      [setup(), { headers: { 'x-twomc-nonce': 'short' } }],
      [setup(), { url: '/bridge/v1/events?a=b' }],
    ];
    for (const [s, opts] of cases) {
      const res = await run(s.guard, makeReq(opts));
      expect(res.status).toBe(401);
      bodies.add(JSON.stringify(res.body));
    }
    expect([...bodies]).toEqual([JSON.stringify(UNAUTH)]);
  });
});

describe('BridgeSignatureGuard: поколения ключа', () => {
  const FUTURE = new Date(Date.now() + 3600_000);
  const PAST = new Date(Date.now() - 3600_000);

  it('текущее поколение 2 принимается', async () => {
    const { guard } = setup(config(), makeServer({ keyGeneration: 2 }));
    expect(
      (await run(guard, makeReq({ signedWith: { generation: 2 } }))).ok,
    ).toBe(true);
  });

  it('поколение выше текущего - всегда отказ', async () => {
    const { guard } = setup(config(), makeServer({ keyGeneration: 1 }));
    const res = await run(guard, makeReq({ signedWith: { generation: 2 } }));
    expect(res.status).toBe(401);
  });

  it('предыдущее принимается только до previousGenValidTill', async () => {
    const ok = setup(
      config(),
      makeServer({ keyGeneration: 2, previousGenValidTill: FUTURE }),
    );
    expect(
      (await run(ok.guard, makeReq({ signedWith: { generation: 1 } }))).ok,
    ).toBe(true);

    const expired = setup(
      config(),
      makeServer({ keyGeneration: 2, previousGenValidTill: PAST }),
    );
    expect(
      (await run(expired.guard, makeReq({ signedWith: { generation: 1 } })))
        .status,
    ).toBe(401);
  });

  it('предыдущее без previousGenValidTill (экстренная ротация) - отказ', async () => {
    const { guard } = setup(config(), makeServer({ keyGeneration: 2 }));
    expect(
      (await run(guard, makeReq({ signedWith: { generation: 1 } }))).status,
    ).toBe(401);
  });

  it('поколение старше предыдущего - отказ даже в окне', async () => {
    const { guard } = setup(
      config(),
      makeServer({ keyGeneration: 3, previousGenValidTill: FUTURE }),
    );
    expect(
      (await run(guard, makeReq({ signedWith: { generation: 1 } }))).status,
    ).toBe(401);
  });

  it('ключ другого поколения не подходит к подписи (соль и info различаются)', async () => {
    const { guard } = setup(
      config(),
      makeServer({ keyGeneration: 2, previousGenValidTill: FUTURE }),
    );
    const req = makeReq({ signedWith: { generation: 2 } });
    // Подмена key-id на поколение 1 при подписи ключом поколения 2.
    req.headers['x-twomc-key-id'] = 'survival.1';
    expect((await run(guard, req)).status).toBe(401);
  });
});

describe('BridgeSignatureGuard: Redis и БД недоступны', () => {
  it('Redis недоступен - 503 (а не пропуск проверки нонса)', async () => {
    const { guard, redisClient } = setup();
    redisClient.failAll = true;
    const res = await run(guard, makeReq());
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'unavailable' });
    expect(res.res.setHeader).toHaveBeenCalledWith('Retry-After', '5');
  });

  it('БД недоступна - 503', async () => {
    const { guard, findUnique } = setup();
    findUnique.mockRejectedValue(new Error('db down'));
    expect((await run(guard, makeReq())).status).toBe(503);
  });

  it('сбой записи нонса после валидной подписи - 503', async () => {
    const { guard, redisClient } = setup();
    const original = redisClient.set.bind(redisClient);
    redisClient.set = () => {
      redisClient.calls.push('set');
      return Promise.reject(new Error('redis down'));
    };
    expect((await run(guard, makeReq())).status).toBe(503);
    redisClient.set = original;
  });
});

describe('BridgeSignatureGuard: счётчик неудачных аутентификаций', () => {
  it('после 30 неудач с одной подсети - 429 с Retry-After', async () => {
    const { guard } = setup(config(), null);
    for (let i = 0; i < 30; i++) {
      expect((await run(guard, makeReq())).status).toBe(401);
    }
    const blocked = await run(guard, makeReq());
    expect(blocked.status).toBe(429);
    expect(blocked.res.setHeader).toHaveBeenCalledWith(
      'Retry-After',
      expect.stringMatching(/^[1-9][0-9]*$/),
    );
  });

  it('M1: 30 неверных подписей с того же IP не блокируют верно подписанный запрос', async () => {
    const { guard, redisClient } = setup();
    const bad = 'f'.repeat(64);
    for (let i = 0; i < 30; i++) {
      const r = await run(
        guard,
        makeReq({ headers: { 'x-twomc-signature': bad } }),
      );
      expect(r.status).toBe(401);
    }
    expect(redisClient.keysWithPrefix('bridge:authfail:')).toHaveLength(1);
    // Счётчик исчерпан, но верный запрос проходит.
    expect((await run(guard, makeReq())).status).toBe(200);
    // Неверный запрос с исчерпанным счётчиком - 429.
    expect(
      (await run(guard, makeReq({ headers: { 'x-twomc-signature': bad } })))
        .status,
    ).toBe(429);
  });

  it('успешные запросы счётчик не увеличивают', async () => {
    const { guard, redisClient } = setup();
    await run(guard, makeReq());
    expect(redisClient.keysWithPrefix('bridge:authfail:')).toEqual([]);
  });

  it('ошибки формата Redis не трогают', async () => {
    const { guard, redisClient } = setup();
    await run(guard, makeReq({ url: '/x' }));
    expect(redisClient.calls).toEqual([]);
  });
});

describe('BridgeSignatureGuard: логи', () => {
  it('не содержат подписи, нонса, секрета и IP', async () => {
    const lines: string[] = [];
    const spies = (['warn', 'error', 'log', 'debug'] as const).map((m) =>
      jest
        .spyOn(Logger.prototype, m)
        .mockImplementation((...args: unknown[]) => {
          lines.push(args.map(String).join(' '));
        }),
    );
    try {
      const { guard } = setup(config(), null);
      const req = makeReq({ signedWith: { nonce: NONCE_A } });
      await run(guard, req);
      await run(guard, makeReq({ headers: { 'x-twomc-nonce': 'bad' } }));
      const sig = req.headers['x-twomc-signature'] as string;
      const joined = lines.join('\n');
      expect(lines.length).toBeGreaterThan(0);
      expect(joined).not.toContain(sig);
      expect(joined).not.toContain(NONCE_A);
      expect(joined).not.toContain(TEST_MASTER_SECRET);
      expect(joined).not.toContain('203.0.113.9');
      expect(joined).toContain('survival.1');
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
  });
});
