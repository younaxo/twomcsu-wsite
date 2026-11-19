import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { readGiveawayConfig, GiveawayConfig } from './giveaway.config';
import { deriveServerKey, signRequest, parseKeyId } from './giveaway-crypto';
import { GiveawayIngestService } from './giveaway-ingest.service';
import { parseEnvelope } from './giveaway-schema';
import { GiveawaySettingsService } from './giveaway-settings.service';
import { GiveawaySignatureGuard } from './giveaway-signature.guard';
import { GIVEAWAY_SIGN_PATH } from './giveaway.constants';
import { formatMsk } from './giveaway-time';

const SECRET = 'test-master-secret-synthetic-0123456789-abcdef';
const U1 = '11111111-2222-4333-8444-555555555555';
const E = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ev = (over: Record<string, unknown> = {}) => ({
  eventId: E(1),
  type: 'heartbeat',
  playerUuid: U1,
  playerName: 'Steve',
  occurredAt: '2026-11-22T10:00:30.000Z',
  active: true,
  ...over,
});
const env = (o: Record<string, string>) => ({
  get: (k: string) => o[k] as never,
});

describe('giveaway: схема', () => {
  const wrap = (events: unknown[]) =>
    JSON.parse(JSON.stringify({ schema: 'twomc.giveaway.v1', events }));
  it('принимает корректный пакет', () => {
    const r = parseEnvelope(
      wrap([ev(), ev({ type: 'join', active: undefined })]),
    );
    expect(r).toHaveLength(2);
  });
  it.each([
    ['лишнее поле', wrap([ev({ extra: 1 })])],
    ['active у join', wrap([ev({ type: 'join' })])],
    ['heartbeat без active', wrap([ev({ active: undefined })])],
    ['плохой uuid', wrap([ev({ playerUuid: 'x' })])],
    ['время не UTC', wrap([ev({ occurredAt: '2026-11-22T10:00:00+03:00' })])],
    ['ник', wrap([ev({ playerName: 'a b' })])],
    ['пустой', wrap([])],
    ['схема', { schema: 'x', events: [ev()] }],
    ['более 100', wrap(Array.from({ length: 101 }, () => ev()))],
  ])('отклоняет: %s', (_n, body) => {
    expect(parseEnvelope(body)).toBeNull();
  });
  it('100 событий допустимо', () => {
    expect(
      parseEnvelope(wrap(Array.from({ length: 100 }, () => ev()))),
    ).toHaveLength(100);
  });
});

describe('giveaway: конфиг и время', () => {
  it('по умолчанию выключен, слабый секрет -> null', () => {
    const c = readGiveawayConfig(env({ GIVEAWAY_MASTER_SECRET: 'short' }));
    expect(c.enabled).toBe(false);
    expect(c.masterSecret).toBeNull();
    expect(c.defaults.thresholdMinutes).toBe(3000);
  });
  it('даты по умолчанию = МСК', () => {
    const c = readGiveawayConfig(env({}));
    expect(formatMsk(c.defaults.startAt)).toBe('22.11.2026 00:00:00 по МСК');
    expect(formatMsk(c.defaults.cutoffAt)).toBe('30.12.2026 23:59:59 по МСК');
  });
});

describe('giveaway: настройки (порог только вниз после старта)', () => {
  const cfg = readGiveawayConfig(env({}));
  const make = (row: unknown = null) => {
    const upsert = jest.fn();
    const prisma = {
      giveawaySettings: {
        findUnique: jest.fn().mockResolvedValue(row),
        upsert,
      },
    };
    return { svc: new GiveawaySettingsService(prisma as never, cfg), upsert };
  };
  const before = new Date('2026-11-20T00:00:00Z');
  const after = new Date('2026-11-23T00:00:00Z');

  it('до старта порог можно поднять', async () => {
    const { svc, upsert } = make();
    const r = await svc.update({ thresholdMinutes: 4000 }, before);
    expect(r.thresholdMinutes).toBe(4000);
    expect(upsert).toHaveBeenCalled();
  });
  it('после старта поднять нельзя', async () => {
    const { svc, upsert } = make();
    await expect(svc.update({ thresholdMinutes: 3001 }, after)).rejects.toThrow(
      BadRequestException,
    );
    expect(upsert).not.toHaveBeenCalled();
  });
  it('после старта снизить можно, сдвинуть старт нельзя', async () => {
    const { svc } = make();
    await expect(
      svc.update({ thresholdMinutes: 2000 }, after),
    ).resolves.toBeDefined();
    await expect(
      svc.update({ startAt: new Date('2026-12-01T00:00:00Z') }, after),
    ).rejects.toThrow(BadRequestException);
  });
  it('нельзя «стартовать» в прошлое и одновременно поднять порог', async () => {
    const { svc } = make();
    await expect(
      svc.update(
        { startAt: new Date('2026-11-19T00:00:00Z'), thresholdMinutes: 5000 },
        before,
      ),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('giveaway: приём и подсчёт', () => {
  const now = new Date('2026-11-22T10:05:00.000Z');
  const make = () => {
    const calls: Record<string, unknown[]> = {};
    const rec = (n: string) =>
      jest.fn((a: unknown) => {
        (calls[n] ??= []).push(a);
        return Promise.resolve({ count: 0 });
      });
    const prisma = {
      giveawayPlayer: { createMany: rec('pc'), updateMany: rec('pu') },
      giveawaySessionEvent: { createMany: rec('sess') },
      giveawayMinute: {
        createMany: rec('min'),
        count: jest.fn().mockResolvedValue(7),
      },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };
    const settings = {
      get: jest.fn().mockResolvedValue({
        thresholdMinutes: 3000,
        startAt: new Date('2026-11-21T21:00:00Z'),
        cutoffAt: new Date('2026-12-30T20:59:59Z'),
      }),
      describe: jest.fn().mockReturnValue({}),
    };
    return {
      svc: new GiveawayIngestService(prisma as never, settings as never),
      calls,
      prisma,
    };
  };
  const parse = (events: unknown[]) =>
    parseEnvelope(
      JSON.parse(JSON.stringify({ schema: 'twomc.giveaway.v1', events })),
    ) as never;

  it('минуты: два пульса в одной минуте = одна корзина; AFK не считается', async () => {
    const { svc, calls } = make();
    const r = await svc.ingest(
      'anarchy-new-era',
      parse([
        ev({ eventId: E(1), occurredAt: '2026-11-22T10:00:05.000Z' }),
        ev({ eventId: E(2), occurredAt: '2026-11-22T10:00:55.000Z' }),
        ev({
          eventId: E(3),
          occurredAt: '2026-11-22T10:01:05.000Z',
          active: false,
        }),
        ev({ eventId: E(4), occurredAt: '2026-11-22T10:02:05.000Z' }),
      ]),
      now,
    );
    expect(r.accepted).toBe(4);
    const data = (calls.min[0] as { data: { minute: Date }[] }).data;
    expect(data.map((d) => d.minute.toISOString())).toEqual([
      '2026-11-22T10:00:00.000Z',
      '2026-11-22T10:02:00.000Z',
    ]);
  });
  it('отклоняет будущее > 120 с и старше 72 ч, граничные принимает', async () => {
    const { svc } = make();
    const r = await svc.ingest(
      'anarchy-new-era',
      parse([
        ev({ eventId: E(1), occurredAt: '2026-11-22T10:07:01.000Z' }),
        ev({ eventId: E(2), occurredAt: '2026-11-22T10:07:00.000Z' }),
        ev({ eventId: E(3), occurredAt: '2026-11-19T10:04:59.000Z' }),
        ev({ eventId: E(4), occurredAt: '2026-11-19T10:05:00.000Z' }),
      ]),
      now,
    );
    expect(r.rejected).toEqual([
      { eventId: E(1), reason: 'in_future' },
      { eventId: E(3), reason: 'too_old' },
    ]);
    expect(r.accepted).toBe(2);
  });
  it('join/quit идут в журнал сессий с skipDuplicates', async () => {
    const { svc, calls } = make();
    await svc.ingest(
      'anarchy-new-era',
      parse([
        ev({ type: 'join', active: undefined }),
        ev({ eventId: E(2), type: 'quit', active: undefined }),
      ]),
      now,
    );
    const s = calls.sess[0] as { data: unknown[]; skipDuplicates: boolean };
    expect(s.data).toHaveLength(2);
    expect(s.skipDuplicates).toBe(true);
  });
  it('итог = число корзин в окне', async () => {
    const { svc, prisma } = make();
    const p = await svc.getProgress(U1.toUpperCase());
    expect(p.minutes).toBe(7);
    expect(p.remainingMinutes).toBe(2993);
    expect(p.reached).toBe(false);
    const where = prisma.giveawayMinute.count.mock.calls[0][0].where;
    expect(where.playerUuid).toBe(U1);
  });
});

describe('giveaway: guard', () => {
  const SERVER = 'anarchy-new-era';
  const mkCfg = (over: Partial<GiveawayConfig> = {}): GiveawayConfig => ({
    ...readGiveawayConfig(env({})),
    enabled: true,
    masterSecret: Buffer.from(SECRET),
    keyVersion: 2,
    ...over,
  });
  const body = Buffer.from(
    JSON.stringify({ schema: 'twomc.giveaway.v1', events: [ev()] }),
  );
  const sign = (version: number, over: Record<string, string> = {}) => {
    const keyId = `${SERVER}.${version}`;
    const timestamp = over.timestamp ?? String(Math.floor(Date.now() / 1000));
    const nonce = over.nonce ?? 'abcdefghijklmnopqrstuvwx';
    const key = deriveServerKey(Buffer.from(SECRET), SERVER, version);
    return {
      keyId,
      timestamp,
      nonce,
      signature: signRequest(key, {
        keyId,
        timestamp,
        nonce,
        method: 'POST',
        path: GIVEAWAY_SIGN_PATH,
        body,
      }),
    };
  };
  const run = async (
    s: ReturnType<typeof sign>,
    opts: {
      cfg?: GiveawayConfig;
      allowed?: boolean;
      nonceFree?: boolean;
      url?: string;
    } = {},
  ) => {
    const redis = {
      claimNonce: jest.fn().mockResolvedValue(opts.nonceFree ?? true),
      requestRetryAfter: jest.fn().mockResolvedValue(0),
    };
    const settings = {
      isServerAllowed: jest.fn().mockResolvedValue(opts.allowed ?? true),
    };
    const guard = new GiveawaySignatureGuard(
      opts.cfg ?? mkCfg(),
      settings as never,
      redis as never,
    );
    const req = {
      originalUrl: opts.url ?? '/api/giveaway/v1/events',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-giveaway-key-id': s.keyId,
        'x-giveaway-timestamp': s.timestamp,
        'x-giveaway-nonce': s.nonce,
        'x-giveaway-signature': s.signature,
      },
      rawBody: body,
    };
    const res = { setHeader: jest.fn() };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    };
    const out = await guard.canActivate(ctx as never);
    return { out, req, redis };
  };
  const status = async (p: Promise<unknown>) => {
    try {
      await p;
      return 200;
    } catch (e) {
      return (e as { getStatus: () => number }).getStatus();
    }
  };

  it('валидная подпись текущей версии проходит; путь без /api тоже', async () => {
    const r = await run(sign(2));
    expect(r.out).toBe(true);
    expect(r.req).toHaveProperty('giveaway.serverId', SERVER);
    expect(
      (
        await run(sign(2, { nonce: 'bbbbbbbbbbbbbbbbbbbbbbbb' }), {
          url: '/giveaway/v1/events',
        })
      ).out,
    ).toBe(true);
  });
  it('ротация: предыдущая версия принимается, старше - нет', async () => {
    expect((await run(sign(1))).out).toBe(true);
    expect(
      await status(run(sign(1), { cfg: mkCfg({ acceptPreviousKey: false }) })),
    ).toBe(401);
    expect(await status(run(sign(3)))).toBe(401);
  });
  it('503 без флага и без секрета', async () => {
    expect(await status(run(sign(2), { cfg: mkCfg({ enabled: false }) }))).toBe(
      503,
    );
    expect(
      await status(run(sign(2), { cfg: mkCfg({ masterSecret: null }) })),
    ).toBe(503);
  });
  it('401: чужая подпись, устаревшее время, повтор нонса', async () => {
    const s = sign(2);
    expect(await status(run({ ...s, signature: 'a'.repeat(64) }))).toBe(401);
    expect(
      await status(
        run(
          sign(2, { timestamp: String(Math.floor(Date.now() / 1000) - 301) }),
        ),
      ),
    ).toBe(401);
    expect(await status(run(s, { nonceFree: false }))).toBe(401);
  });
  it('403: сервер не в списке разрешённых', async () => {
    expect(await status(run(sign(2), { allowed: false }))).toBe(403);
  });
  it('key-id разбирается', () => {
    expect(parseKeyId('anarchy-new-era.2')).toEqual({
      serverId: 'anarchy-new-era',
      version: 2,
    });
    expect(parseKeyId('x.0')).toBeNull();
    expect(new UnauthorizedException()).toBeDefined();
  });
});
