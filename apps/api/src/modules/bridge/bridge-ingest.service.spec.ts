import { Logger } from '@nestjs/common';
import {
  FakePrisma,
  FakeRedisClient,
  SLUG,
  eventId,
  fakeRedisService,
  makeEvent,
  makeServer,
  punishmentData,
} from '../../../test/support/bridge-support';
import { payloadHash } from './bridge-crypto';
import {
  BridgePunishmentSource,
  BridgeSourceEvent,
  NoPunishmentSubscriber,
} from './bridge-punishment.source';
import { BridgeRedisService } from './bridge-redis.service';
import { BridgeIngestService } from './bridge-ingest.service';
import { BridgeBatch, parseEnvelope } from './bridge-schema';
import { BridgeConfig } from './bridge.config';
import { BridgeAuthContext } from './bridge.types';
import { resolveCapabilities } from './bridge-capabilities';

function config(over: Partial<BridgeConfig> = {}): BridgeConfig {
  return {
    enabled: true,
    masterSecret: Buffer.alloc(32, 1),
    timestampWindowS: 60,
    maxBodyBytes: 262_144,
    keyOverlapDays: 7,
    applyLatencyLimitMs: 2000,
    ...over,
  };
}

function ctx(
  over: Partial<BridgeAuthContext['server']> = {},
): BridgeAuthContext {
  const server = makeServer(over);
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

function setup(cfg: BridgeConfig = config()) {
  const prisma = new FakePrisma();
  const redisClient = new FakeRedisClient();
  const redis = new BridgeRedisService(fakeRedisService(redisClient));
  const source = new BridgePunishmentSource();
  const received: BridgeSourceEvent[] = [];
  source.subscribe((e) => {
    received.push(e);
  });
  const service = new BridgeIngestService(cfg, prisma as never, redis, source);
  return { service, prisma, redisClient, source, received };
}

const created = (
  over: Record<string, unknown> = {},
  ev: Record<string, unknown> = {},
) => makeEvent('punishment.created', punishmentData(over), ev);

describe('BridgeIngestService: punishment.*', () => {
  it('accepted: событие уходит источнику, журнал и маркер записаны', async () => {
    const { service, prisma, received, redisClient } = setup();
    const ev = created();
    const [res] = await service.ingest(ctx(), batch([ev]));
    expect(res).toEqual({ eventId: ev.eventId, status: 'accepted' });
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      type: 'created',
      serverSlug: SLUG,
      sourceScope: 'default',
    });
    const row = [...prisma.log.values()][0];
    expect(row).toMatchObject({
      serverSlug: SLUG,
      eventId: ev.eventId,
      type: 'punishment.created',
      status: 'applied',
      payloadHash: payloadHash(ev.data),
    });
    expect(
      redisClient.keysWithPrefix('bridge:ps:survival:BAN:123'),
    ).toHaveLength(1);
  });

  it('sourceScope берётся из строки сервера', async () => {
    const { service, received } = setup();
    await service.ingest(ctx({ sourceScope: 'eu' }), batch([created()]));
    expect(received[0].sourceScope).toBe('eu');
  });

  it('повтор того же события - duplicate, повторного применения нет', async () => {
    const { service, received } = setup();
    const ev = created();
    await service.ingest(ctx(), batch([ev]));
    const [res] = await service.ingest(ctx(), batch([ev]));
    expect(res.status).toBe('duplicate');
    expect(received).toHaveLength(1);
  });

  it('параллельная отправка одной пачки - одно применение', async () => {
    const { service, received } = setup();
    const ev = created();
    const [a, b] = await Promise.all([
      service.ingest(ctx(), batch([ev])),
      service.ingest(ctx(), batch([ev])),
    ]);
    expect([a[0].status, b[0].status].sort()).toEqual([
      'accepted',
      'duplicate',
    ]);
    expect(received).toHaveLength(1);
  });

  it('тот же eventId с другим содержимым - rejected conflict', async () => {
    const { service, received } = setup();
    const id = eventId();
    await service.ingest(ctx(), batch([created({}, { eventId: id })]));
    const [res] = await service.ingest(
      ctx(),
      batch([created({ reason: 'другая причина' }, { eventId: id })]),
    );
    expect(res).toEqual({ eventId: id, status: 'rejected', code: 'conflict' });
    expect(received).toHaveLength(1);
  });

  it('порядок ключей в data не создаёт conflict', async () => {
    const { service } = setup();
    const id = eventId();
    const data = punishmentData();
    const reversed = Object.fromEntries(Object.entries(data).reverse());
    await service.ingest(
      ctx(),
      batch([makeEvent('punishment.created', data, { eventId: id })]),
    );
    const [res] = await service.ingest(
      ctx(),
      batch([makeEvent('punishment.created', reversed, { eventId: id })]),
    );
    expect(res.status).toBe('duplicate');
  });

  it('одинаковый eventId разных серверов независим', async () => {
    const { service, received } = setup();
    const id = eventId();
    const other = makeServer({ slug: 'creative' });
    const otherCtx: BridgeAuthContext = {
      keyId: 'creative.1',
      slug: 'creative',
      generation: 1,
      server: other,
      capabilities: resolveCapabilities(null),
    };
    await service.ingest(ctx(), batch([created({}, { eventId: id })]));
    const [res] = await service.ingest(
      otherCtx,
      batch([created({}, { eventId: id, serverId: 'creative' })]),
    );
    expect(res.status).toBe('accepted');
    expect(received).toHaveLength(2);
  });

  describe('stale и порядок (5.3)', () => {
    const t = (ms: number) => new Date(Date.now() - ms).toISOString();

    it('событие старше применённого состояния записи - stale, не журналируется', async () => {
      const { service, prisma, received } = setup();
      await service.ingest(
        ctx(),
        batch([created({}, { occurredAt: t(1000) })]),
      );
      const logged = prisma.log.size;
      const [res] = await service.ingest(
        ctx(),
        batch([
          makeEvent(
            'punishment.updated',
            punishmentData({ reason: 'старое' }),
            { occurredAt: t(5000) },
          ),
        ]),
      );
      expect(res.status).toBe('stale');
      expect(received).toHaveLength(1);
      expect(prisma.log.size).toBe(logged);
    });

    it('при равенстве occurredAt побеждает принятое позже', async () => {
      const { service, received } = setup();
      const at = t(2000);
      await service.ingest(ctx(), batch([created({}, { occurredAt: at })]));
      const [res] = await service.ingest(
        ctx(),
        batch([
          makeEvent('punishment.updated', punishmentData({ reason: 'позже' }), {
            occurredAt: at,
          }),
        ]),
      );
      expect(res.status).toBe('accepted');
      expect(received).toHaveLength(2);
    });

    it('новое событие продвигает маркер, повторное старое - stale', async () => {
      const { service } = setup();
      await service.ingest(
        ctx(),
        batch([created({}, { occurredAt: t(3000) })]),
      );
      const [newer] = await service.ingest(
        ctx(),
        batch([
          makeEvent('punishment.removed', punishmentData(), {
            occurredAt: t(1000),
          }),
        ]),
      );
      const [older] = await service.ingest(
        ctx(),
        batch([
          makeEvent('punishment.updated', punishmentData({ reason: 'x' }), {
            occurredAt: t(2000),
          }),
        ]),
      );
      expect(newer.status).toBe('accepted');
      expect(older.status).toBe('stale');
    });

    it('маркеры разных записей независимы', async () => {
      const { service } = setup();
      await service.ingest(ctx(), batch([created({}, { occurredAt: t(100) })]));
      const [res] = await service.ingest(
        ctx(),
        batch([created({ sourceId: '124' }, { occurredAt: t(5000) })]),
      );
      expect(res.status).toBe('accepted');
    });

    it.each([
      ['старше 7 суток', -(7 * 24 * 3600_000 + 60_000)],
      ['дальше 60 с в будущем', 61_000],
    ])('occurredAt %s - invalid_data', async (_n, delta) => {
      const { service, received, prisma } = setup();
      const [res] = await service.ingest(
        ctx(),
        batch([
          created(
            {},
            { occurredAt: new Date(Date.now() + delta).toISOString() },
          ),
        ]),
      );
      expect(res).toMatchObject({ status: 'rejected', code: 'invalid_data' });
      expect(received).toHaveLength(0);
      expect(prisma.log.size).toBe(0);
    });

    it('граница прошлого и будущего принимается', async () => {
      const { service } = setup();
      const [a, b] = await service.ingest(
        ctx(),
        batch([
          created(
            {},
            {
              occurredAt: new Date(
                Date.now() - 6 * 24 * 3600_000,
              ).toISOString(),
            },
          ),
          created(
            { sourceId: '9' },
            { occurredAt: new Date(Date.now() + 30_000).toISOString() },
          ),
        ]),
      );
      expect(a.status).toBe('accepted');
      expect(b.status).toBe('accepted');
    });
  });

  it('deleted: передаётся источнику', async () => {
    const { service, received } = setup();
    const [res] = await service.ingest(
      ctx(),
      batch([
        makeEvent('punishment.deleted', { kind: 'MUTE', sourceId: '55' }),
      ]),
    );
    expect(res.status).toBe('accepted');
    expect(received[0]).toMatchObject({
      type: 'deleted',
      kind: 'MUTE',
      sourceId: '55',
    });
  });

  it('status из data игнорируется: источнику уходит вычисленный', async () => {
    const { service, received } = setup();
    await service.ingest(ctx(), batch([created({ status: 'REMOVED' })]));
    const e = received[0];
    expect(e.type === 'created' && e.punishment.status).toBe('ACTIVE');
  });
});

describe('BridgeIngestService: отказы по событию', () => {
  it('чужой serverId - server_mismatch, ничего не применяется и не пишется', async () => {
    const { service, received, prisma } = setup();
    const [res] = await service.ingest(
      ctx(),
      batch([created({}, { serverId: 'creative' })]),
    );
    expect(res).toMatchObject({ status: 'rejected', code: 'server_mismatch' });
    expect(received).toHaveLength(0);
    expect(prisma.log.size).toBe(0);
    expect(prisma.txCount).toBe(0);
  });

  it('serverSlug в журнале и событии - из ключа', async () => {
    const { service, prisma, received } = setup();
    await service.ingest(ctx(), batch([created()]));
    expect([...prisma.log.values()][0].serverSlug).toBe(SLUG);
    expect(received[0].serverSlug).toBe(SLUG);
  });

  it.each([
    ['ip в data', { ip: '203.0.113.5' }],
    ['лишнее поле', { foo: 'bar' }],
    ['плохой kind', { kind: 'JAIL' }],
    ['плохой sourceId', { sourceId: 'abc' }],
  ])('invalid_data: %s; в журнал не пишется (R117)', async (_n, over) => {
    const { service, received, prisma } = setup();
    const [res] = await service.ingest(ctx(), batch([created(over)]));
    expect(res).toMatchObject({ status: 'rejected', code: 'invalid_data' });
    expect(received).toHaveLength(0);
    expect(prisma.log.size).toBe(0);
  });

  it('data больше 16 КБ - invalid_data', async () => {
    const { service, received } = setup();
    const [res] = await service.ingest(
      ctx(),
      batch([created({ reason: 'я'.repeat(9000) })]),
    );
    expect(res).toMatchObject({ status: 'rejected', code: 'invalid_data' });
    expect(received).toHaveLength(0);
  });

  it.each([
    'player.join',
    'player.quit',
    'player.stats.snapshot',
    'chat.message',
    'chat.command',
    'inventory.snapshot',
    'inventory.delta',
    'something.new',
  ])('%s - rejected unsupported_type', async (type) => {
    const { service, received, prisma } = setup();
    const [res] = await service.ingest(
      ctx(),
      batch([
        makeEvent(type, { uuid: '069a79f4-44e9-4726-a5be-fca90e38aaf5' }),
      ]),
    );
    expect(res).toMatchObject({ status: 'rejected', code: 'unsupported_type' });
    expect(received).toHaveLength(0);
    expect(prisma.log.size).toBe(0);
  });

  it('player.* отклоняется и при player-events: true (срез 1)', async () => {
    const { service } = setup();
    const [res] = await service.ingest(
      ctx({ capabilities: { punishments: true, 'player-events': true } }),
      batch([makeEvent('player.join', {})]),
    );
    expect(res).toMatchObject({ status: 'rejected', code: 'unsupported_type' });
  });

  it('capabilities проверяются ДО разбора и применения', async () => {
    const { service, received, prisma } = setup();
    const [res] = await service.ingest(
      ctx({ capabilities: { punishments: false } }),
      batch([created({ ip: '1.1.1.1' })]),
    );
    expect(res).toMatchObject({ status: 'rejected', code: 'unsupported_type' });
    expect(received).toHaveLength(0);
    expect(prisma.txCount).toBe(0);
  });

  it('неизвестные capabilities права не расширяют (NULL = punishments)', async () => {
    const { service } = setup();
    const [res] = await service.ingest(
      ctx({ capabilities: { superuser: true } }),
      batch([created()]),
    );
    expect(res.status).toBe('accepted');
  });

  it('результаты возвращаются в порядке событий, пачка смешанная', async () => {
    const { service } = setup();
    const events = [
      created(),
      makeEvent('player.join', {}),
      created({ ip: 'x' }),
      makeEvent('bridge.hello', { pluginVersion: '1.0' }),
    ];
    const res = await service.ingest(ctx(), batch(events));
    expect(res.map((r) => r.eventId)).toEqual(events.map((e) => e.eventId));
    expect(res.map((r) => r.status)).toEqual([
      'accepted',
      'rejected',
      'rejected',
      'accepted',
    ]);
  });
});

describe('BridgeIngestService: сбои применения (503 для вызывающего)', () => {
  it('нет подписчика - исключение, в журнале остаётся received (повтор возможен)', async () => {
    const prisma = new FakePrisma();
    const redisClient = new FakeRedisClient();
    const service = new BridgeIngestService(
      config(),
      prisma as never,
      new BridgeRedisService(fakeRedisService(redisClient)),
      new BridgePunishmentSource(),
    );
    const ev = created();
    await expect(service.ingest(ctx(), batch([ev]))).rejects.toBeInstanceOf(
      NoPunishmentSubscriber,
    );
    expect([...prisma.log.values()].map((r) => r.status)).toEqual(['received']);
  });

  it('исключение подписчика оставляет received, повтор применяется заново', async () => {
    const { service, source, prisma, received } = setup();
    let fail = true;
    source.subscribe(() => {
      if (fail) throw new Error('mirror down');
    });
    const ev = created();
    await expect(service.ingest(ctx(), batch([ev]))).rejects.toThrow(
      'mirror down',
    );
    expect([...prisma.log.values()].map((r) => r.status)).toEqual(['received']);
    fail = false;
    const [res] = await service.ingest(ctx(), batch([ev]));
    expect(res.status).toBe('accepted');
    expect([...prisma.log.values()].map((r) => r.status)).toEqual(['applied']);
    expect(received.length).toBeGreaterThanOrEqual(2);
  });

  it('Redis недоступен при проверке порядка - исключение, зеркало не тронуто', async () => {
    const { service, redisClient, prisma, received } = setup();
    redisClient.failAll = true;
    await expect(service.ingest(ctx(), batch([created()]))).rejects.toThrow();
    expect([...prisma.log.values()].map((r) => r.status)).toEqual(['received']);
    expect(received).toHaveLength(0);
  });
});

describe('BridgeIngestService: hello, overflow, служебное', () => {
  it('hello обновляет метаданные сервера', async () => {
    const { service, prisma } = setup();
    const [res] = await service.ingest(
      ctx(),
      batch([
        makeEvent('bridge.hello', {
          pluginVersion: '1.2.3',
          platform: 'paper',
        }),
      ]),
    );
    expect(res.status).toBe('accepted');
    expect(prisma.bridgeServer.update).toHaveBeenCalledWith({
      where: { id: 'srv-1' },
      data: { pluginVersion: '1.2.3', platform: 'paper' },
    });
    expect(prisma.log.size).toBe(0);
  });

  it('hello с неверными полями - invalid_data', async () => {
    const { service } = setup();
    const [res] = await service.ingest(
      ctx(),
      batch([makeEvent('bridge.hello', { pluginVersion: 'v'.repeat(40) })]),
    );
    expect(res).toMatchObject({ status: 'rejected', code: 'invalid_data' });
  });

  it('queue.overflow принимается, неверный - invalid_data', async () => {
    const { service } = setup();
    const [ok, bad] = await service.ingest(
      ctx(),
      batch([
        makeEvent('queue.overflow', { fromSeq: 1, toSeq: 3, dropped: 3 }),
        makeEvent('queue.overflow', { fromSeq: 'a' }),
      ]),
    );
    expect(ok.status).toBe('accepted');
    expect(bad).toMatchObject({ status: 'rejected', code: 'invalid_data' });
  });

  it('lastSeenAt обновляется не чаще раза в 30 секунд', async () => {
    const stale = setup();
    await stale.service.ingest(
      ctx({ lastSeenAt: new Date(Date.now() - 60_000) }),
      batch([created()]),
    );
    expect(stale.prisma.bridgeServer.update).toHaveBeenCalledTimes(1);
    const fresh = setup();
    await fresh.service.ingest(
      ctx({ lastSeenAt: new Date(Date.now() - 1000) }),
      batch([created()]),
    );
    expect(fresh.prisma.bridgeServer.update).not.toHaveBeenCalled();
  });

  it('сбой обновления lastSeenAt не ломает ответ', async () => {
    const { service, prisma } = setup();
    prisma.bridgeServer.update.mockRejectedValue(new Error('db'));
    const [res] = await service.ingest(ctx(), batch([created()]));
    expect(res.status).toBe('accepted');
  });

  it('медленное применение ставит подсказку backpressure', async () => {
    const { service, source, redisClient } = setup(
      config({ applyLatencyLimitMs: 1 }),
    );
    source.subscribe(async () => {
      await new Promise((r) => setTimeout(r, 15));
    });
    await service.ingest(ctx(), batch([created()]));
    expect(redisClient.store.get('bridge:slow:survival.1')).toBe('1');
  });
});

describe('BridgeIngestService: логи', () => {
  it('не содержат data, причин, ников и uuid', async () => {
    const lines: string[] = [];
    const spies = (['warn', 'error', 'log', 'debug'] as const).map((m) =>
      jest
        .spyOn(Logger.prototype, m)
        .mockImplementation((...args: unknown[]) => {
          lines.push(args.map(String).join(' '));
        }),
    );
    try {
      const { service } = setup();
      const secretReason = 'уникальная-причина-для-проверки-логов';
      await service.ingest(
        ctx(),
        batch([
          created({ reason: secretReason, ip: '203.0.113.5' }),
          makeEvent('player.join', { name: 'TestPlayer001' }),
        ]),
      );
      const joined = lines.join('\n');
      expect(lines.length).toBeGreaterThan(0);
      expect(joined).not.toContain(secretReason);
      expect(joined).not.toContain('203.0.113.5');
      expect(joined).not.toContain('TestPlayer001');
      expect(joined).not.toContain('069a79f4');
      expect(joined).toContain('survival.1');
      expect(joined).toContain('invalid_data');
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
  });
});

describe('BridgeIngestService: сбой между шагами (R121, M2)', () => {
  it('публикация прошла, applied не записан: повтор применяется заново и даёт accepted', async () => {
    const { service, prisma, received } = setup();
    const ev = created();
    const original = prisma.bridgeEventLog.updateMany;
    prisma.bridgeEventLog.updateMany = () => Promise.reject(new Error('db down'));
    await expect(service.ingest(ctx(), batch([ev]))).rejects.toThrow('db down');
    expect([...prisma.log.values()].map((r) => r.status)).toEqual(['received']);
    prisma.bridgeEventLog.updateMany = original;
    const [res] = await service.ingest(ctx(), batch([ev]));
    expect(res.status).toBe('accepted');
    expect(received).toHaveLength(2);
    expect([...prisma.log.values()].map((r) => r.status)).toEqual(['applied']);
    const [again] = await service.ingest(ctx(), batch([ev]));
    expect(again.status).toBe('duplicate');
    expect(received).toHaveLength(2);
  });

  it('received с другим payloadHash - conflict, не повторное применение', async () => {
    const { service, prisma, received } = setup();
    const ev = created();
    prisma.log.set(`${ev.serverId}\u0000${ev.eventId}`, {
      serverSlug: ev.serverId as string,
      eventId: ev.eventId as string,
      type: 'punishment.created',
      status: 'received',
      payloadHash: 'x',
    } as never);
    const [res] = await service.ingest(ctx(), batch([ev]));
    expect(res).toMatchObject({ status: 'rejected', code: 'conflict' });
    expect(received).toHaveLength(0);
  });

  it('старое событие после нового - stale, зеркало не перезаписывается', async () => {
    const { service, received } = setup();
    const t = Date.now();
    const at = (ms: number) => new Date(t - ms).toISOString();
    const newer = created({}, { occurredAt: at(1000) });
    const older = created({}, { occurredAt: at(5000) });
    const [a] = await service.ingest(ctx(), batch([newer]));
    const [b] = await service.ingest(ctx(), batch([older]));
    expect(a.status).toBe('accepted');
    expect(b.status).toBe('stale');
    expect(received).toHaveLength(1);
  });

  it('конкурентные пачки одной записи: без исключений, статусы accepted/stale/duplicate', async () => {
    const { service, received } = setup();
    const t = Date.now();
    const evs = [1, 2, 3, 4, 5, 6].map((i) =>
      created({}, { occurredAt: new Date(t - 10_000 + i * 1000).toISOString() }),
    );
    const results = await Promise.all(
      [...evs].reverse().map((e) => service.ingest(ctx(), batch([e]))),
    );
    const statuses = results.map((r) => r[0].status);
    expect(statuses).toContain('accepted');
    for (const s of statuses) {
      expect(['accepted', 'stale']).toContain(s);
    }
    expect(received.length).toBe(statuses.filter((s) => s === 'accepted').length);
  });
});
