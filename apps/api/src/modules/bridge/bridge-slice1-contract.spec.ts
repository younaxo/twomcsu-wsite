import { ExecutionContext, HttpException, Logger } from '@nestjs/common';
import {
  FakePrisma,
  FakeRedisClient,
  fakeRedisService,
  makeEvent,
  makeServer,
  punishmentData,
} from '../../../test/support/bridge-support';
import { resolveCapabilities } from './bridge-capabilities';
import { BridgeIngestService } from './bridge-ingest.service';
import { BridgePunishmentSource } from './bridge-punishment.source';
import { BridgeRateLimitGuard } from './bridge-rate-limit.guard';
import { BridgeRedisService } from './bridge-redis.service';
import { BridgeBatch, parseEnvelope } from './bridge-schema';
import { BridgeConfig } from './bridge.config';
import { KEY_ID_PATTERN, SLUG_PATTERN } from './bridge.constants';
import { BridgeAuthContext } from './bridge.types';

/// Срез 1: сверка с итоговым контрактом (Q32, 2.3 п. 0 и п. 8, 5.1).

describe('key-id: формат 2.3 п. 0', () => {
  it('регулярное выражение в точности совпадает с контрактом', () => {
    expect(KEY_ID_PATTERN.source).toBe(
      '^[a-z0-9][a-z0-9-]{1,31}\\.[0-9]{1,6}$',
    );
    expect(SLUG_PATTERN.source).toBe('^[a-z0-9][a-z0-9-]{1,31}$');
  });

  it.each([
    'survival.1',
    'ab.1',
    '0a.999999',
    'a-b.12',
    `a${'b'.repeat(31)}.1`,
  ])('допускает %s', (v) => {
    expect(KEY_ID_PATTERN.test(v)).toBe(true);
  });

  it.each([
    '-ab.1',
    'a.1',
    '.1',
    'ab.',
    'ab.1234567',
    'ab.0x',
    'Ab.1',
    'a_b.1',
    'a.b.1',
    `a${'b'.repeat(32)}.1`,
    'ab.1\n',
    ' ab.1',
  ])('отвергает %j', (v) => {
    expect(KEY_ID_PATTERN.test(v)).toBe(false);
  });
});

const config: BridgeConfig = {
  enabled: true,
  masterSecret: Buffer.alloc(32, 1),
  timestampWindowS: 60,
  maxBodyBytes: 262_144,
  keyOverlapDays: 7,
  applyLatencyLimitMs: 2000,
  bodyReadTimeoutMs: 10000,
  deliveryEnabled: false,
};

function ctx(): BridgeAuthContext {
  const server = makeServer();
  return {
    keyId: `${server.slug}.1`,
    slug: server.slug,
    generation: 1,
    server,
    capabilities: resolveCapabilities(server.capabilities),
  };
}

function batch(events: Array<Record<string, unknown>>): BridgeBatch {
  const parsed = parseEnvelope({
    schema: 'twomc.bridge.v1',
    sentAt: new Date().toISOString(),
    events,
  });
  if (!parsed.ok) throw new Error('test batch invalid');
  return parsed.value;
}

function setup() {
  const prisma = new FakePrisma();
  const redisClient = new FakeRedisClient();
  const redis = new BridgeRedisService(fakeRedisService(redisClient));
  const source = new BridgePunishmentSource();
  const received: unknown[] = [];
  source.subscribe((e) => {
    received.push(e);
  });
  const service = new BridgeIngestService(
    config,
    prisma as never,
    redis,
    source,
  );
  return { service, prisma, redisClient, received };
}

describe('Q32: chat.*, player.*, inventory.* в срезе 1', () => {
  const IP = '203.0.113.77';
  const types = [
    'chat.message',
    'chat.command',
    'chat.x',
    'player.join',
    'player.quit',
    'player.stats.snapshot',
    'inventory.snapshot',
    'inventory.delta',
  ];

  it.each(types)(
    '%s: rejected unsupported_type, без применения, без записи в журнал и без IP в логах',
    async (type) => {
      const lines: string[] = [];
      const spies = (['warn', 'error', 'log', 'debug'] as const).map((m) =>
        jest
          .spyOn(Logger.prototype, m)
          .mockImplementation((...args: unknown[]) => {
            lines.push(args.map(String).join(' '));
          }),
      );
      try {
        const { service, prisma, received, redisClient } = setup();
        const [res] = await service.ingest(
          ctx(),
          batch([
            makeEvent(type, {
              ip: IP,
              address: IP,
              text: 'секретный-текст-чата',
              name: 'TestPlayer001',
            }),
          ]),
        );
        expect(res).toMatchObject({
          status: 'rejected',
          code: 'unsupported_type',
        });
        expect(received).toHaveLength(0);
        expect(prisma.log.size).toBe(0);
        expect(prisma.txCount).toBe(0);
        expect(redisClient.keysWithPrefix('bridge:')).toEqual([]);
        const joined = lines.join('\n');
        expect(joined).not.toContain(IP);
        expect(joined).not.toContain('секретный-текст-чата');
        expect(joined).not.toContain('TestPlayer001');
      } finally {
        spies.forEach((s) => s.mockRestore());
      }
    },
  );

  it('отказ chat.*/player.*/inventory.* не мешает punishment.* той же пачки', async () => {
    const { service, received } = setup();
    const results = await service.ingest(
      ctx(),
      batch([
        makeEvent('chat.message', {}),
        makeEvent('punishment.created', punishmentData()),
        makeEvent('inventory.snapshot', {}),
        makeEvent('player.join', { ip: IP_FOR_BATCH }),
      ]),
    );
    expect(results.map((r) => r.status)).toEqual([
      'rejected',
      'accepted',
      'rejected',
      'rejected',
    ]);
    expect(received).toHaveLength(1);
  });
});

const IP_FOR_BATCH = '198.51.100.8';

describe('bridge_event_log: только служебные поля', () => {
  it('строка журнала не содержит причин, ников, uuid и IP', async () => {
    const { service, prisma } = setup();
    await service.ingest(
      ctx(),
      batch([
        makeEvent(
          'punishment.created',
          punishmentData({ reason: 'уникальная-причина-журнала' }),
        ),
      ]),
    );
    expect(prisma.log.size).toBe(1);
    const row = [...prisma.log.values()][0];
    expect(Object.keys(row).sort()).toEqual([
      'eventId',
      'payloadHash',
      'serverSlug',
      'status',
      'type',
    ]);
    const dump = JSON.stringify(row);
    expect(dump).not.toContain('уникальная-причина-журнала');
    expect(dump).not.toMatch(/\d+\.\d+\.\d+\.\d+/);
    expect(row.payloadHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('2.3 п. 8: Redis недоступен - fail-closed 503', () => {
  function httpCtx() {
    const res = { setHeader: jest.fn() };
    const req = { bridge: { keyId: 'survival.1' } };
    const context = {
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    } as unknown as ExecutionContext;
    return { res, context };
  }

  it('лимитер по key-id: сбой Redis - 503 с Retry-After, запрос не пропускается', async () => {
    const redisClient = new FakeRedisClient();
    const guard = new BridgeRateLimitGuard(
      new BridgeRedisService(fakeRedisService(redisClient)),
    );
    redisClient.failAll = true;
    const { res, context } = httpCtx();
    const err = await guard.canActivate(context).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(503);
    expect((err as HttpException).getResponse()).toEqual({
      error: 'unavailable',
    });
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '5');
  });

  it('лимитер без предшествующей подписи не пропускает запрос', async () => {
    const guard = new BridgeRateLimitGuard(
      new BridgeRedisService(fakeRedisService(new FakeRedisClient())),
    );
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({}),
        getResponse: () => ({ setHeader: jest.fn() }),
      }),
    } as unknown as ExecutionContext;
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 401,
    });
  });
});
