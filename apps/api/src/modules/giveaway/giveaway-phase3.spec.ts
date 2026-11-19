import { createHash } from 'crypto';
import { HttpException } from '@nestjs/common';
import { GiveawayAdminAuthService } from './giveaway-admin-auth.service';
import { GiveawayAdminGuard } from './giveaway-admin.guard';
import { GiveawayConfig, readGiveawayConfig } from './giveaway.config';
import { GiveawayDataService } from './giveaway-data.service';
import { GiveawayDiscordClient } from './giveaway-discord.client';
import { GiveawayDrawService } from './giveaway-draw.service';
import { GiveawayStreamService } from './giveaway-stream.service';
import { GiveawayTestService, testUuid } from './giveaway-test.service';
import { VECTOR_ENTRIES } from './giveaway-draw.fixtures';

const SECRET = 'test-master-secret-synthetic-0123456789-abcdef';
const ADMIN_ID = '111111111111111111';
const ORIGIN = 'https://admin.giveaway.twomc.su';
const NOW = new Date('2027-01-01T10:00:00.000Z');

function makeConfig(over: Record<string, string> = {}): GiveawayConfig {
  const env: Record<string, string> = {
    GIVEAWAY_ENABLED: 'true',
    GIVEAWAY_MASTER_SECRET: SECRET,
    GIVEAWAY_DISCORD_CLIENT_ID: 'cid',
    GIVEAWAY_DISCORD_CLIENT_SECRET: 'csecret',
    GIVEAWAY_DISCORD_REDIRECT_URI: `${ORIGIN}/api/giveaway/v1/admin/auth/callback`,
    GIVEAWAY_ADMIN_DISCORD_IDS: `${ADMIN_ID},222222222222222222`,
    GIVEAWAY_TEST_MODE_ENABLED: 'true',
    ...over,
  };
  return readGiveawayConfig({ get: (k: string) => env[k] as never });
}

// ---------------------------------------------------------------- вход

interface SessionRow {
  id: string;
  tokenHash: string;
  discordId: string;
  discordName: string;
  lastSeenAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

function makeAuth(config = makeConfig()) {
  const sessions: SessionRow[] = [];
  const oauth = new Map<string, string>();
  const prisma = {
    giveawayAdminSession: {
      create: jest.fn(
        ({ data }: { data: Omit<SessionRow, 'id' | 'revokedAt'> }) => {
          const row = {
            id: `s${sessions.length + 1}`,
            revokedAt: null,
            ...data,
          };
          sessions.push(row);
          return Promise.resolve(row);
        },
      ),
      findUnique: jest.fn(({ where }: { where: { tokenHash: string } }) =>
        Promise.resolve(
          sessions.find((s) => s.tokenHash === where.tokenHash) ?? null,
        ),
      ),
      updateMany: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<SessionRow>;
        }) => {
          const hit = sessions.filter((s) => s.id === where.id);
          hit.forEach((s) => Object.assign(s, data));
          return Promise.resolve({ count: hit.length });
        },
      ),
    },
  };
  const redis = {
    putOAuthState: jest.fn((k: string, v: string) => {
      oauth.set(k, v);
      return Promise.resolve();
    }),
    takeOAuthState: jest.fn((k: string) => {
      const v = oauth.get(k) ?? null;
      oauth.delete(k);
      return Promise.resolve(v);
    }),
    hit: jest.fn(() => Promise.resolve(0)),
  };
  const audit = {
    record: jest.fn(() => Promise.resolve()),
    recordSafe: jest.fn(() => Promise.resolve()),
  };
  const discord = new GiveawayDiscordClient(config);
  const auth = new GiveawayAdminAuthService(
    prisma as never,
    redis as never,
    discord,
    audit as never,
    config,
  );
  return { auth, prisma, redis, audit, sessions, config };
}

function mockDiscord(me: { id: string; mfa_enabled: boolean } | 'fail') {
  return jest.spyOn(global, 'fetch').mockImplementation((input: unknown) => {
    const url = String(input);
    if (url.endsWith('/oauth2/token/revoke')) {
      return Promise.resolve(new Response('{}', { status: 200 }));
    }
    if (url.endsWith('/oauth2/token')) {
      return Promise.resolve(
        me === 'fail'
          ? new Response('{}', { status: 400 })
          : new Response(JSON.stringify({ access_token: 'discord-token' }), {
              status: 200,
            }),
      );
    }
    return Promise.resolve(
      new Response(JSON.stringify({ username: 'admin', ...(me as object) }), {
        status: 200,
      }),
    );
  });
}

function stateFrom(url: string): string {
  return new URL(url).searchParams.get('state') as string;
}

describe('админ-вход Discord OAuth2', () => {
  afterEach(() => jest.restoreAllMocks());

  it('startLogin: PKCE S256, scope identify, state в Redis по хэшу', async () => {
    const { auth, redis } = makeAuth();
    const { url, binder } = await auth.startLogin();
    const q = new URL(url).searchParams;
    expect(url.startsWith('https://discord.com/oauth2/authorize?')).toBe(true);
    expect(q.get('response_type')).toBe('code');
    expect(q.get('scope')).toBe('identify');
    expect(q.get('code_challenge_method')).toBe('S256');
    expect(q.get('client_id')).toBe('cid');
    expect(binder).toHaveLength(43);
    const [key, raw] = redis.putOAuthState.mock.calls[0] as unknown as [
      string,
      string,
    ];
    expect(key).toBe(createHash('sha256').update(stateFrom(url)).digest('hex'));
    const stored = JSON.parse(raw) as { verifier: string };
    expect(q.get('code_challenge')).toBe(
      createHash('sha256').update(stored.verifier).digest('base64url'),
    );
  });

  it('успех: сессия, токен только хэшем; state одноразовый (повтор отклонён)', async () => {
    const { auth, sessions } = makeAuth();
    const spy = mockDiscord({ id: ADMIN_ID, mfa_enabled: true });
    const { url, binder } = await auth.startLogin();
    const state = stateFrom(url);
    const ok = await auth.finishLogin('code', state, binder, NOW);
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(sessions[0].tokenHash).not.toBe(ok.token);
    expect(sessions[0].tokenHash).toBe(auth.tokenHash(ok.token));
    const tokenCall = spy.mock.calls.find((c) =>
      String(c[0]).endsWith('/oauth2/token'),
    );
    expect(String((tokenCall?.[1] as { body: string }).body)).toContain(
      'code_verifier=',
    );
    const replay = await auth.finishLogin('code', state, binder, NOW);
    expect(replay).toEqual({ ok: false, error: 'state_invalid' });
  });

  it('binder не совпал, state неизвестен или формат неверный: отказ', async () => {
    const { auth } = makeAuth();
    mockDiscord({ id: ADMIN_ID, mfa_enabled: true });
    const { url } = await auth.startLogin();
    expect(
      await auth.finishLogin('c', stateFrom(url), 'x'.repeat(43), NOW),
    ).toEqual({
      ok: false,
      error: 'state_invalid',
    });
    expect((await auth.finishLogin('c', 'bad', 'b', NOW)).ok).toBe(false);
    expect((await auth.finishLogin(undefined, undefined, null, NOW)).ok).toBe(
      false,
    );
  });

  it('не из allowlist, без MFA, сбой обмена: отказ с аудитом', async () => {
    const t = makeAuth();
    mockDiscord({ id: '999999999999999999', mfa_enabled: true });
    let s = await t.auth.startLogin();
    expect(
      await t.auth.finishLogin('c', stateFrom(s.url), s.binder, NOW),
    ).toEqual({
      ok: false,
      error: 'not_allowed',
    });
    jest.restoreAllMocks();
    mockDiscord({ id: ADMIN_ID, mfa_enabled: false });
    s = await t.auth.startLogin();
    expect(
      await t.auth.finishLogin('c', stateFrom(s.url), s.binder, NOW),
    ).toEqual({
      ok: false,
      error: 'mfa_required',
    });
    jest.restoreAllMocks();
    mockDiscord('fail');
    s = await t.auth.startLogin();
    expect(
      await t.auth.finishLogin('c', stateFrom(s.url), s.binder, NOW),
    ).toEqual({
      ok: false,
      error: 'login_failed',
    });
    expect(t.audit.recordSafe).toHaveBeenCalledTimes(3);
    expect(t.sessions).toHaveLength(0);
  });

  it('пустой allowlist: вход закрыт (fail closed)', async () => {
    const t = makeAuth(makeConfig({ GIVEAWAY_ADMIN_DISCORD_IDS: '' }));
    expect(t.auth.isLoginOpen()).toBe(false);
    expect(await t.auth.finishLogin('c', 'x'.repeat(43), 'b', NOW)).toEqual({
      ok: false,
      error: 'login_closed',
    });
    const none = makeAuth(makeConfig({ GIVEAWAY_DISCORD_CLIENT_SECRET: '' }));
    expect(none.auth.isLoginOpen()).toBe(false);
  });

  async function login(t: ReturnType<typeof makeAuth>): Promise<string> {
    mockDiscord({ id: ADMIN_ID, mfa_enabled: true });
    const s = await t.auth.startLogin();
    const r = await t.auth.finishLogin('c', stateFrom(s.url), s.binder, NOW);
    if (!r.ok) throw new Error('login');
    return r.token;
  }

  it('сессия: idle 30 мин, абсолютный срок 8 ч, выход, удаление из allowlist', async () => {
    const t = makeAuth();
    const token = await login(t);
    const at = (ms: number) => new Date(NOW.getTime() + ms);
    const min = 60_000;
    expect((await t.auth.resolve(token, at(20 * min)))?.discordId).toBe(
      ADMIN_ID,
    );
    // lastSeenAt обновился на 20-й минуте: ещё 20 минут допустимы
    expect(await t.auth.resolve(token, at(40 * min))).not.toBeNull();
    expect(await t.auth.resolve(token, at(40 * min + 31 * min))).toBeNull();
    const t2 = makeAuth();
    const tok2 = await login(t2);
    let ts = 0;
    for (let i = 0; i < 16; i++) {
      ts += 29 * min;
      expect(await t2.auth.resolve(tok2, at(ts))).not.toBeNull();
      if (ts > 8 * 60 * min) break;
    }
    expect(await t2.auth.resolve(tok2, at(8 * 60 * min + min))).toBeNull();
    const t3 = makeAuth();
    const tok3 = await login(t3);
    const p = await t3.auth.resolve(tok3, at(min));
    await t3.auth.logout(p as never, at(2 * min));
    expect(await t3.auth.resolve(tok3, at(3 * min))).toBeNull();
    // ID удалён из allowlist: доступ закрыт сразу
    const t4 = makeAuth();
    const tok4 = await login(t4);
    t4.config.admin.allowedDiscordIds = [];
    expect(await t4.auth.resolve(tok4, at(min))).toBeNull();
    expect(await t4.auth.resolve('bad token', at(min))).toBeNull();
    expect(await t4.auth.resolve(null, at(min))).toBeNull();
  });

  it('CSRF: Origin и заголовок обязательны для изменяющих запросов', async () => {
    const t = makeAuth();
    const token = await login(t);
    const guard = new GiveawayAdminGuard(
      t.auth,
      t.redis as never,
      t.audit as never,
      t.config,
    );
    const run = (method: string, headers: Record<string, string>) =>
      guard.canActivate({
        switchToHttp: () => ({
          getRequest: () => ({
            method,
            ip: '1.2.3.4',
            headers: { cookie: `gw_admin=${token}`, ...headers },
          }),
          getResponse: () => ({ setHeader: jest.fn() }),
        }),
      } as never);
    const csrf = t.auth.csrfFor(token);
    expect(await run('GET', {})).toBe(true);
    expect(await run('POST', { origin: ORIGIN, 'x-giveaway-csrf': csrf })).toBe(
      true,
    );
    await expect(
      run('POST', { 'x-giveaway-csrf': csrf }),
    ).rejects.toBeInstanceOf(HttpException);
    await expect(
      run('POST', { origin: 'https://evil.example', 'x-giveaway-csrf': csrf }),
    ).rejects.toMatchObject({
      status: 403,
    });
    await expect(run('PATCH', { origin: ORIGIN })).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      run('DELETE', { origin: ORIGIN, 'x-giveaway-csrf': 'a'.repeat(64) }),
    ).rejects.toMatchObject({
      status: 403,
    });
    expect(t.audit.recordSafe).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'csrf_denied' }),
    );
    // без сессии
    const noSession = guard.canActivate({
      switchToHttp: () => ({
        getRequest: () => ({ method: 'GET', ip: '1.2.3.4', headers: {} }),
        getResponse: () => ({ setHeader: jest.fn() }),
      }),
    } as never);
    await expect(noSession).rejects.toMatchObject({ status: 401 });
  });
});

// -------------------------------------------------------- розыгрыш

interface DrawRow {
  id: string;
  context: string;
  status: string;
  snapshotJson: string;
  snapshotHash: string;
  ticketCount: number;
  frozenAt: Date;
  frozenBy: string;
  seedHex: string | null;
  algorithm: string | null;
  orderJson: string | null;
  prizesJson: string | null;
  calculatedAt: Date | null;
  broadcastAt: Date | null;
  revision: number;
}
interface WinnerRow {
  id: string;
  drawId: string;
  place: number;
  orderIndex: number;
  status: string;
  createdAt: Date;
  [k: string]: unknown;
}

function makeDraw(opts: { mode?: 'live' | 'test'; prizes?: number[] } = {}) {
  const draws: DrawRow[] = [];
  const winners: WinnerRow[] = [];
  let seq = 0;
  const db = {
    giveawayDraw: {
      findUnique: jest.fn(
        ({
          where,
          include,
        }: {
          where: { context: string };
          include?: unknown;
        }) => {
          const d = draws.find((x) => x.context === where.context);
          if (d === undefined) return Promise.resolve(null);
          return Promise.resolve(
            include
              ? { ...d, winners: winners.filter((w) => w.drawId === d.id) }
              : d,
          );
        },
      ),
      create: jest.fn(({ data }: { data: Partial<DrawRow> }) => {
        if (draws.some((x) => x.context === data.context)) {
          return Promise.reject(
            Object.assign(new Error('dup'), { code: 'P2002' }),
          );
        }
        const row = {
          id: `d${++seq}`,
          seedHex: null,
          algorithm: null,
          orderJson: null,
          prizesJson: null,
          calculatedAt: null,
          broadcastAt: null,
          revision: 1,
          ...data,
        } as DrawRow;
        draws.push(row);
        return Promise.resolve(row);
      }),
      updateMany: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string; status: string };
          data: Record<string, unknown>;
        }) => {
          const d = draws.find(
            (x) => x.id === where.id && x.status === where.status,
          );
          if (d === undefined) return Promise.resolve({ count: 0 });
          for (const [k, v] of Object.entries(data)) {
            if (k === 'revision')
              d.revision += (v as { increment: number }).increment;
            else (d as unknown as Record<string, unknown>)[k] = v;
          }
          return Promise.resolve({ count: 1 });
        },
      ),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: { revision: { increment: number } };
        }) => {
          const d = draws.find((x) => x.id === where.id) as DrawRow;
          d.revision += data.revision.increment;
          return Promise.resolve(d);
        },
      ),
    },
    giveawayWinner: {
      createMany: jest.fn(({ data }: { data: Record<string, unknown>[] }) => {
        data.forEach((r) =>
          winners.push({
            id: `w${++seq}`,
            createdAt: new Date(seq),
            ...r,
          } as WinnerRow),
        );
        return Promise.resolve({ count: data.length });
      }),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: `w${++seq}`,
          createdAt: new Date(seq),
          ...data,
        } as WinnerRow;
        if (
          winners.some(
            (w) => w.drawId === row.drawId && w.orderIndex === row.orderIndex,
          )
        ) {
          return Promise.reject(
            Object.assign(new Error('dup'), { code: 'P2002' }),
          );
        }
        winners.push(row);
        return Promise.resolve(row);
      }),
      findFirst: jest.fn(
        ({ where }: { where: { id: string; drawId: string } }) =>
          Promise.resolve(
            winners.find(
              (w) => w.id === where.id && w.drawId === where.drawId,
            ) ?? null,
          ),
      ),
      findMany: jest.fn(({ where }: { where: { drawId: string } }) =>
        Promise.resolve(winners.filter((w) => w.drawId === where.drawId)),
      ),
      updateMany: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string; status: string };
          data: Record<string, unknown>;
        }) => {
          const w = winners.find(
            (x) => x.id === where.id && x.status === where.status,
          );
          if (w === undefined) return Promise.resolve({ count: 0 });
          Object.assign(w, data);
          return Promise.resolve({ count: 1 });
        },
      ),
    },
    $queryRaw: jest.fn(() => Promise.resolve([])),
  };
  const prisma = {
    ...db,
    $transaction: jest.fn((cb: (tx: typeof db) => unknown) => cb(db)),
  };
  const data = {
    allTickets: jest.fn(() => Promise.resolve(VECTOR_ENTRIES)),
    totalMinutes: jest.fn(() => Promise.resolve(new Map<string, number>())),
  };
  const prizes = {
    ordered: jest.fn(() =>
      Promise.resolve(
        (opts.prizes ?? [2, 1]).map((q, i) => ({
          id: `p${i}`,
          name: `Приз ${i + 1}`,
          quantity: q,
          imageFile: null,
          priority: i,
        })),
      ),
    ),
  };
  const settings = {
    get: jest.fn(() =>
      Promise.resolve({ cutoffAt: new Date('2026-12-30T20:59:59.000Z') }),
    ),
  };
  const audit = { record: jest.fn(() => Promise.resolve()) };
  const stream = { publish: jest.fn(() => Promise.resolve()) };
  const svc = new GiveawayDrawService(
    prisma as never,
    data as never,
    prizes as never,
    settings as never,
    audit as never,
    stream as never,
  );
  return { svc, draws, winners, data, stream, audit, prisma };
}

describe('розыгрыш: заморозка, расчёт, эфир, дисквалификация', () => {
  it('живой режим: заморозка только после отсечки; хэш снимка; идемпотентна', async () => {
    const t = makeDraw();
    await expect(
      t.svc.freeze('live', ADMIN_ID, new Date('2026-12-30T20:00:00Z')),
    ).rejects.toMatchObject({
      response: { error: 'cutoff_not_reached' },
    });
    const s = await t.svc.freeze('live', ADMIN_ID, NOW);
    expect(s.status).toBe('frozen');
    expect(s.snapshotHash).toBe(
      '0436be4eeadab96d00085c89cc04a3bfb2880edbb38e1ba5d9ca444fb8ce1996',
    );
    await t.svc.freeze('live', ADMIN_ID, NOW);
    expect(t.draws).toHaveLength(1);
  });

  it('«Рассчитать» ровно один раз, в том числе параллельно; неверный хэш и фраза отклонены', async () => {
    const t = makeDraw();
    const frozen = await t.svc.freeze('live', ADMIN_ID, NOW);
    const hash = frozen.snapshotHash as string;
    await expect(
      t.svc.calculate('live', hash, 'нет', ADMIN_ID),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      t.svc.calculate('live', 'a'.repeat(64), 'РАССЧИТАТЬ', ADMIN_ID),
    ).rejects.toMatchObject({
      response: { error: 'snapshot_mismatch' },
    });
    const results = await Promise.allSettled([
      t.svc.calculate('live', hash, 'РАССЧИТАТЬ', ADMIN_ID),
      t.svc.calculate('live', hash, 'РАССЧИТАТЬ', ADMIN_ID),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find(
      (r) => r.status === 'rejected',
    ) as PromiseRejectedResult;
    expect(failed.reason).toMatchObject({
      response: { error: 'already_calculated' },
    });
    expect(t.winners).toHaveLength(3);
    await expect(
      t.svc.calculate('live', hash, 'РАССЧИТАТЬ', ADMIN_ID),
    ).rejects.toMatchObject({
      response: { error: 'already_calculated' },
    });
    const state = await t.svc.state('live', NOW);
    expect(state.seed).toMatch(/^[0-9a-f]{64}$/);
    expect(state.order).toHaveLength(10);
    expect(state.winners.map((w) => w.place)).toEqual([1, 2, 3]);
    expect(state.winners[0].prizeName).toBe('Приз 1');
    expect(state.winners[2].prizeName).toBe('Приз 2');
  });

  it('до эфира публично только хэш; после эфира - seed, порядок, победители; событие в поток', async () => {
    const t = makeDraw();
    const hash = (await t.svc.freeze('live', ADMIN_ID, NOW))
      .snapshotHash as string;
    await t.svc.calculate('live', hash, 'РАССЧИТАТЬ', ADMIN_ID);
    const pre = (await t.svc.publicResults('live')) as Record<string, unknown>;
    expect(pre).toEqual({
      test: false,
      state: 'frozen',
      snapshotHash: hash,
      ticketCount: 10,
      revision: 1,
    });
    await expect(t.svc.broadcast('live', ADMIN_ID, NOW)).resolves.toMatchObject(
      { status: 'broadcast' },
    );
    await expect(t.svc.broadcast('live', ADMIN_ID, NOW)).rejects.toMatchObject({
      response: { error: 'already_broadcast' },
    });
    expect(t.stream.publish).toHaveBeenCalledTimes(1);
    expect(t.stream.publish).toHaveBeenCalledWith(
      'live',
      'results',
      expect.objectContaining({ state: 'results' }),
    );
    const pub = (await t.svc.publicResults('live')) as {
      state: string;
      seed: string;
      order: unknown[];
      winners: Record<string, unknown>[];
    };
    expect(pub.state).toBe('results');
    expect(pub.seed).toMatch(/^[0-9a-f]{64}$/);
    expect(pub.order).toHaveLength(10);
    expect(Object.keys(pub.winners[0]).sort()).toEqual([
      'imageFile',
      'place',
      'playerName',
      'prizeName',
      'ticket',
    ]);
    expect(JSON.stringify(pub)).not.toContain('00000000-0000-4000');
  });

  it('эфир до расчёта невозможен', async () => {
    const t = makeDraw();
    await t.svc.freeze('live', ADMIN_ID, NOW);
    await expect(t.svc.broadcast('live', ADMIN_ID, NOW)).rejects.toMatchObject({
      response: { error: 'not_calculated' },
    });
  });

  it('дисквалификация: место получает следующий неиспользованный билет той же перестановки; после эфира событие', async () => {
    const t = makeDraw();
    const hash = (await t.svc.freeze('live', ADMIN_ID, NOW))
      .snapshotHash as string;
    await t.svc.calculate('live', hash, 'РАССЧИТАТЬ', ADMIN_ID);
    await t.svc.broadcast('live', ADMIN_ID, NOW);
    t.stream.publish.mockClear();
    const first = (await t.svc.state('live', NOW)).winners[0];
    const r = await t.svc.disqualify(
      'live',
      first.id,
      'накрутка онлайна',
      ADMIN_ID,
      NOW,
    );
    expect(r.replacement?.place).toBe(first.place);
    expect(r.replacement?.ticket).not.toBe(first.ticket);
    const order = r.draw.order.map((o) => o.ticket);
    expect(order.indexOf(r.replacement?.ticket as string)).toBe(3);
    expect(t.stream.publish).toHaveBeenCalledTimes(1);
    await expect(
      t.svc.disqualify('live', first.id, 'ещё раз', ADMIN_ID, NOW),
    ).rejects.toMatchObject({
      response: { error: 'winner_not_active' },
    });
    // вторая дисквалификация берёт следующий индекс (4), не повторяя использованные
    const second = r.draw.winners.find(
      (w) => w.place === 2 && w.status === 'active',
    ) as { id: string };
    const r2 = await t.svc.disqualify(
      'live',
      second.id,
      'аномалия',
      ADMIN_ID,
      NOW,
    );
    expect(order.indexOf(r2.replacement?.ticket as string)).toBe(4);
    const pub = (await t.svc.publicResults('live')) as {
      winners: unknown[];
      disqualified: unknown[];
    };
    expect(pub.winners).toHaveLength(3);
    expect(pub.disqualified).toHaveLength(2);
    expect(JSON.stringify(pub.disqualified)).not.toContain('накрутка');
    expect(t.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'winner_disqualify' }),
    );
  });

  it('билеты закончились: место остаётся пустым', async () => {
    const t = makeDraw({ prizes: [10] });
    const hash = (await t.svc.freeze('live', ADMIN_ID, NOW))
      .snapshotHash as string;
    await t.svc.calculate('live', hash, 'РАССЧИТАТЬ', ADMIN_ID);
    const w = (await t.svc.state('live', NOW)).winners[0];
    const r = await t.svc.disqualify('live', w.id, 'причина', ADMIN_ID, NOW);
    expect(r.replacement).toBeNull();
  });

  it('тест без призов использует демо-призы; живой без призов отклонён', async () => {
    const t = makeDraw({ prizes: [] });
    const hash = (await t.svc.freeze('test', ADMIN_ID, NOW))
      .snapshotHash as string;
    await t.svc.calculate('test', hash, 'РАССЧИТАТЬ', ADMIN_ID);
    expect((await t.svc.state('test', NOW)).winners).toHaveLength(3);
    const live = makeDraw({ prizes: [] });
    const h2 = (await live.svc.freeze('live', ADMIN_ID, NOW))
      .snapshotHash as string;
    await expect(
      live.svc.calculate('live', h2, 'РАССЧИТАТЬ', ADMIN_ID),
    ).rejects.toMatchObject({
      response: { error: 'no_prizes' },
    });
  });

  it('контексты разделены: тестовый розыгрыш не виден в live', async () => {
    const t = makeDraw();
    await t.svc.freeze('test', ADMIN_ID, NOW);
    expect((await t.svc.state('live', NOW)).status).toBe('none');
    expect((await t.svc.publicResults('live')).state).toBe('idle');
    expect((await t.svc.publicResults('test')).test).toBe(true);
  });
});

// ------------------------------------------- изоляция теста и live

describe('изоляция тестового режима', () => {
  const LIVE_TABLES = ['giveawayTicket', 'giveawayMinute', 'giveawayPlayer'];
  const TEST_TABLES = ['giveawayTestTicket', 'giveawayTestTimeGrant'];

  function spyPrisma() {
    const calls: string[] = [];
    const wrap = (table: string) =>
      new Proxy(
        {},
        {
          get: (_t, method: string) => (args: unknown) => {
            calls.push(`${table}.${method}`);
            if (method === 'count') return Promise.resolve(0);
            if (method === 'findUnique') return Promise.resolve(null);
            if (method === 'aggregate')
              return Promise.resolve({ _sum: { minutes: 0 } });
            void args;
            return Promise.resolve([]);
          },
        },
      );
    const prisma: Record<string, unknown> = {
      $queryRaw: () => {
        calls.push('$queryRaw');
        return Promise.resolve([]);
      },
    };
    for (const t of [...LIVE_TABLES, ...TEST_TABLES, 'giveawayDraw'])
      prisma[t] = wrap(t);
    return { prisma, calls };
  }
  const settings = {
    get: () =>
      Promise.resolve({
        thresholdMinutes: 3000,
        startAt: new Date('2026-11-21T21:00:00Z'),
        cutoffAt: new Date('2026-12-30T20:59:59Z'),
        allowedServers: ['anarchy-new-era'],
      }),
  };

  it('live читает только реальные таблицы, test - только тестовые', async () => {
    const { prisma, calls } = spyPrisma();
    const data = new GiveawayDataService(prisma as never, settings as never);
    await data.tickets('live', 'abc', 1, 25);
    await data.allTickets('live');
    await data.totalMinutes('live', ['u']);
    await data.profile('live', 'u');
    expect(calls.every((c) => !TEST_TABLES.some((t) => c.startsWith(t)))).toBe(
      true,
    );
    expect(calls.some((c) => c.startsWith('giveawayTicket'))).toBe(true);
    calls.length = 0;
    await data.tickets('test', 'abc', 1, 25);
    await data.allTickets('test');
    await data.totalMinutes('test', ['u']);
    await data.profile('test', 'u');
    expect(
      calls.every(
        (c) => !LIVE_TABLES.some((t) => c.startsWith(t)) && c !== '$queryRaw',
      ),
    ).toBe(true);
    expect(calls.some((c) => c.startsWith('giveawayTestTicket'))).toBe(true);
  });

  it('ручное время в живом режиме отключено и ничего не пишет', async () => {
    const { prisma, calls } = spyPrisma();
    const svc = new GiveawayTestService(
      prisma as never,
      settings as never,
      { publish: jest.fn() } as never,
    );
    await expect(
      svc.grantTime('live', 'Steve', 100, undefined, ADMIN_ID),
    ).rejects.toMatchObject({
      response: { error: 'manual_time_disabled_in_live' },
    });
    expect(calls).toHaveLength(0);
    await svc.grantTime('test', 'Steve', 100, '2026-12-01', ADMIN_ID);
    expect(calls).toEqual([
      'giveawayTestTimeGrant.aggregate',
      'giveawayTestTimeGrant.create',
    ]);
    expect(calls.some((c) => LIVE_TABLES.some((t) => c.startsWith(t)))).toBe(
      false,
    );
  });

  it('сброс теста трогает только тестовые данные и контекст test', async () => {
    const ops: string[] = [];
    const del = (name: string) =>
      jest.fn((a: unknown) => {
        ops.push(`${name}:${JSON.stringify(a)}`);
        return Promise.resolve({});
      });
    const prisma = {
      giveawayDraw: { deleteMany: del('draw') },
      giveawayTestTicket: { deleteMany: del('testTicket') },
      giveawayTestTimeGrant: { deleteMany: del('testGrant') },
      giveawayTicket: { deleteMany: del('LIVE') },
      $transaction: (x: Promise<unknown>[]) => Promise.all(x),
    };
    const stream = { publish: jest.fn(() => Promise.resolve()) };
    await new GiveawayTestService(
      prisma as never,
      settings as never,
      stream as never,
    ).reset();
    expect(ops.some((o) => o.startsWith('LIVE'))).toBe(false);
    expect(ops).toContain('draw:{"where":{"context":"test"}}');
    expect(stream.publish).toHaveBeenCalledWith('test', 'reset', {});
  });

  it('тестовый UUID детерминирован и узнаваем', () => {
    expect(testUuid('Steve')).toMatch(/^00000000-0000-4000-8000-[0-9a-f]{12}$/);
    expect(testUuid('Steve')).toBe(testUuid('steve'));
  });

  it('тестовый билет: нужно не меньше порога минут', async () => {
    const grants: { playerUuid: string; minutes: number }[] = [];
    const tickets: {
      ticket: string;
      playerUuid: string;
      playerName: string;
    }[] = [];
    const prisma = {
      giveawayTestTimeGrant: {
        aggregate: ({ where }: { where: { playerUuid: string } }) =>
          Promise.resolve({
            _sum: {
              minutes: grants
                .filter((g) => g.playerUuid === where.playerUuid)
                .reduce((a, g) => a + g.minutes, 0),
            },
          }),
        create: ({
          data,
        }: {
          data: { playerUuid: string; minutes: number };
        }) => {
          grants.push(data);
          return Promise.resolve(data);
        },
      },
      giveawayTestTicket: {
        findUnique: ({ where }: { where: { playerUuid: string } }) =>
          Promise.resolve(
            tickets.find((t) => t.playerUuid === where.playerUuid) ?? null,
          ),
        create: ({ data }: { data: (typeof tickets)[number] }) => {
          tickets.push(data);
          return Promise.resolve(data);
        },
      },
    };
    const svc = new GiveawayTestService(
      prisma as never,
      settings as never,
      {} as never,
    );
    await svc.grantTime('test', 'Alex', 2999, undefined, ADMIN_ID);
    await expect(svc.issueTicket('Alex')).rejects.toMatchObject({
      response: { error: 'not_enough_time' },
    });
    await svc.grantTime('test', 'Alex', 1, undefined, ADMIN_ID);
    const a = await svc.issueTicket('Alex');
    expect(a.ticket).toMatch(/^[A-HJ-NP-Z][0-9]{3}$/);
    expect((await svc.issueTicket('Alex')).ticket).toBe(a.ticket);
  });
});

// ------------------------------------------------------------ SSE

describe('SSE-эфир', () => {
  function fakeRes() {
    const chunks: string[] = [];
    const handlers: Record<string, () => void> = {};
    const res = {
      status: jest.fn(),
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn((s: string) => chunks.push(s)),
      end: jest.fn(),
      on: (e: string, f: () => void) => (handlers[e] = f),
    };
    const req = {
      on: (e: string, f: () => void) => (handlers[`req-${e}`] = f),
    };
    return { res, req, chunks, close: () => handlers.close?.() };
  }
  function fakeRedis() {
    let listener: ((m: string) => void) | null = null;
    return {
      subscribe: jest.fn((l: (m: string) => void) => {
        listener = l;
        return Promise.resolve(() => undefined);
      }),
      publish: jest.fn((m: string) => {
        listener?.(m);
        return Promise.resolve();
      }),
      hasSubscriber: () => listener !== null,
    };
  }

  it('публикация через Redis доходит до клиентов своего канала; тест не виден публике', async () => {
    const svc = new GiveawayStreamService(fakeRedis() as never);
    const live = fakeRes();
    const test = fakeRes();
    expect(
      await svc.attach(live.req as never, live.res as never, 'live', 'ip1', 1),
    ).toBe(true);
    await svc.attach(test.req as never, test.res as never, 'test', 'ip2', 1);
    expect(live.res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'text/event-stream; charset=utf-8',
    );
    expect(live.chunks[0]).toBe('retry: 5000\n\n');
    expect(live.chunks[1]).toContain('event: ready');
    await svc.publish('live', 'results', { revision: 4, state: 'results' });
    expect(live.chunks.join('')).toContain(
      'event: results\ndata: {"revision":4,"state":"results"}',
    );
    expect(test.chunks.join('')).not.toContain('event: results');
    await svc.publish('test', 'reset', {});
    expect(test.chunks.join('')).toContain('event: reset');
    expect(live.chunks.join('')).not.toContain('event: reset');
    svc.onModuleDestroy();
  });

  it('heartbeat-комментарии, лимит соединений на адрес, освобождение при закрытии', async () => {
    jest.useFakeTimers();
    try {
      const svc = new GiveawayStreamService(fakeRedis() as never);
      const c = fakeRes();
      await svc.attach(c.req as never, c.res as never, 'live', 'ip', 1);
      jest.advanceTimersByTime(15_000);
      expect(c.chunks).toContain(': hb\n\n');
      const rest = Array.from({ length: 5 }, () => fakeRes());
      for (const r of rest)
        expect(
          await svc.attach(r.req as never, r.res as never, 'live', 'ip', 1),
        ).toBe(true);
      const extra = fakeRes();
      expect(
        await svc.attach(
          extra.req as never,
          extra.res as never,
          'live',
          'ip',
          1,
        ),
      ).toBe(false);
      c.close();
      expect(
        await svc.attach(
          extra.req as never,
          extra.res as never,
          'live',
          'ip',
          1,
        ),
      ).toBe(true);
      svc.onModuleDestroy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('без подписчика Redis или при сбое публикации - локальная рассылка', async () => {
    const redis = fakeRedis();
    redis.publish = jest.fn((_m: string) => Promise.reject(new Error('down')));
    const svc = new GiveawayStreamService(redis as never);
    const c = fakeRes();
    await svc.attach(c.req as never, c.res as never, 'live', 'ip', 1);
    await svc.publish('live', 'results', { revision: 2 });
    expect(c.chunks.join('')).toContain('event: results');
    svc.onModuleDestroy();
  });
});
