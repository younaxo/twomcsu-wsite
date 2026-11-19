import { createHash } from 'crypto';
import { HttpException } from '@nestjs/common';
import { GiveawayAdminAuthService } from './giveaway-admin-auth.service';
import { GiveawayAdminGuard } from './giveaway-admin.guard';
import { GiveawayConfig, readGiveawayConfig } from './giveaway.config';
import { GiveawayDrawService } from './giveaway-draw.service';
import { GiveawayStreamService } from './giveaway-stream.service';
import { GiveawayTestService, testUuid } from './giveaway-test.service';
import { sha256Hex } from './giveaway-crypto';

const SECRET = 'test-master-secret-synthetic-0123456789-abcdef';
const ADMIN_ID = '123456789012345678';
const ORIGIN = 'https://admin.giveaway.twomc.su';
const NOW = new Date('2026-12-31T10:00:00.000Z');

function cfg(extra: Record<string, string> = {}): GiveawayConfig {
  const env: Record<string, string> = {
    GIVEAWAY_ENABLED: 'true',
    GIVEAWAY_MASTER_SECRET: SECRET,
    GIVEAWAY_DISCORD_CLIENT_ID: 'cid',
    GIVEAWAY_DISCORD_CLIENT_SECRET: 'csecret',
    GIVEAWAY_DISCORD_REDIRECT_URI: `${ORIGIN}/api/giveaway/v1/admin/auth/callback`,
    GIVEAWAY_ADMIN_DISCORD_IDS: ADMIN_ID,
    GIVEAWAY_TEST_MODE_ENABLED: 'true',
    ...extra,
  };
  return readGiveawayConfig({ get: (k: string) => env[k] as never });
}

/* ---------- вход: state, PKCE, allowlist, MFA, сессии ---------- */

function authEnv(config = cfg()) {
  const oauth = new Map<string, string>();
  const sessions: Record<string, unknown>[] = [];
  const audit: Record<string, unknown>[] = [];
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
  };
  const identity = { id: ADMIN_ID, name: 'Admin', mfaEnabled: true };
  const discord = {
    authorizeUrl: jest.fn(
      (state: string, challenge: string) =>
        `https://discord.com/oauth2/authorize?state=${state}&code_challenge=${challenge}`,
    ),
    exchange: jest.fn(() => Promise.resolve('access' as string | null)),
    identify: jest.fn(() =>
      Promise.resolve({ ...identity } as typeof identity | null),
    ),
    revoke: jest.fn(() => Promise.resolve()),
  };
  const prisma = {
    giveawayAdminSession: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: `s${sessions.length + 1}`,
          revokedAt: null,
          ...data,
        };
        sessions.push(row);
        return Promise.resolve(row);
      }),
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
          data: Record<string, unknown>;
        }) => {
          const s = sessions.find((x) => x.id === where.id);
          if (s) Object.assign(s, data);
          return Promise.resolve({ count: s ? 1 : 0 });
        },
      ),
    },
  };
  const auditSvc = {
    record: jest.fn((e: Record<string, unknown>) => {
      audit.push(e);
      return Promise.resolve();
    }),
    recordSafe: jest.fn((e: Record<string, unknown>) => {
      audit.push(e);
      return Promise.resolve();
    }),
  };
  const svc = new GiveawayAdminAuthService(
    prisma as never,
    redis as never,
    discord as never,
    auditSvc as never,
    config,
  );
  return { svc, oauth, sessions, audit, discord, identity, config, auditSvc };
}

async function login(e: ReturnType<typeof authEnv>) {
  const started = await e.svc.startLogin();
  const state = new URL(started.url).searchParams.get('state') as string;
  return { ...started, state };
}

describe('admin login (ADR-G003 п. 2)', () => {
  it('login: state и PKCE S256 в Redis по хэшу state', async () => {
    const e = authEnv();
    const { state, binder, url } = await login(e);
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(binder).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const stored = JSON.parse(e.oauth.get(`${sha256Hex(state)}`) as string);
    expect(stored.binderHash).toBe(sha256Hex(binder));
    const challenge = new URL(url).searchParams.get('code_challenge');
    const expected = createHash('sha256')
      .update(stored.verifier)
      .digest('base64url');
    expect(challenge).toBe(expected);
  });

  it('успех: сессия хранит HMAC-хэш токена, не сам токен; verifier передан', async () => {
    const e = authEnv();
    const { state, binder } = await login(e);
    const r = await e.svc.finishLogin('code', state, binder, NOW);
    expect(r.ok).toBe(true);
    const token = (r as { token: string }).token;
    expect(e.sessions).toHaveLength(1);
    expect(e.sessions[0].tokenHash).toBe(e.svc.tokenHash(token));
    expect(e.sessions[0].tokenHash).not.toBe(token);
    expect(JSON.stringify(e.sessions)).not.toContain(token);
    expect(e.discord.exchange).toHaveBeenCalledWith(
      'code',
      expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    );
    expect(e.discord.revoke).toHaveBeenCalled();
  });

  it('state одноразовый', async () => {
    const e = authEnv();
    const { state, binder } = await login(e);
    expect((await e.svc.finishLogin('code', state, binder, NOW)).ok).toBe(true);
    const again = await e.svc.finishLogin('code', state, binder, NOW);
    expect(again).toEqual({ ok: false, error: 'state_invalid' });
  });

  it('чужой binder (login CSRF) и отсутствие cookie отклоняются', async () => {
    const e = authEnv();
    const { state } = await login(e);
    expect(await e.svc.finishLogin('code', state, 'x'.repeat(43), NOW)).toEqual(
      {
        ok: false,
        error: 'state_invalid',
      },
    );
    const l2 = await login(e);
    expect(await e.svc.finishLogin('code', l2.state, null, NOW)).toEqual({
      ok: false,
      error: 'state_invalid',
    });
  });

  it('неизвестный state и плохой формат отклоняются', async () => {
    const e = authEnv();
    const { binder } = await login(e);
    expect(
      await e.svc.finishLogin('code', 'A'.repeat(43), binder, NOW),
    ).toEqual({ ok: false, error: 'state_invalid' });
    expect(await e.svc.finishLogin('code', 'bad', binder, NOW)).toEqual({
      ok: false,
      error: 'state_invalid',
    });
  });

  it('не из allowlist: not_allowed, сессия не создаётся', async () => {
    const e = authEnv();
    e.identity.id = '999999999999999999';
    const { state, binder } = await login(e);
    expect(await e.svc.finishLogin('code', state, binder, NOW)).toEqual({
      ok: false,
      error: 'not_allowed',
    });
    expect(e.sessions).toHaveLength(0);
  });

  it('без MFA в Discord: mfa_required', async () => {
    const e = authEnv();
    e.identity.mfaEnabled = false;
    const { state, binder } = await login(e);
    expect(await e.svc.finishLogin('code', state, binder, NOW)).toEqual({
      ok: false,
      error: 'mfa_required',
    });
    expect(e.sessions).toHaveLength(0);
  });

  it('сбой обмена кода: login_failed', async () => {
    const e = authEnv();
    e.discord.exchange.mockResolvedValueOnce(null);
    const { state, binder } = await login(e);
    expect(await e.svc.finishLogin('code', state, binder, NOW)).toEqual({
      ok: false,
      error: 'login_failed',
    });
  });

  it('пустой allowlist или нет ключей Discord: вход закрыт', async () => {
    for (const extra of <Record<string, string>[]>[
      { GIVEAWAY_ADMIN_DISCORD_IDS: '' },
      { GIVEAWAY_DISCORD_CLIENT_SECRET: '' },
      { GIVEAWAY_MASTER_SECRET: 'weak' },
    ]) {
      const e = authEnv(cfg(extra));
      expect(e.svc.isLoginOpen()).toBe(false);
      expect(await e.svc.finishLogin('c', 'A'.repeat(43), 'b', NOW)).toEqual({
        ok: false,
        error: 'login_closed',
      });
    }
  });

  it('сессия: idle 30 мин, абсолют 8 ч, отзыв, удаление из allowlist', async () => {
    const e = authEnv();
    const { state, binder } = await login(e);
    const token = (
      (await e.svc.finishLogin('code', state, binder, NOW)) as { token: string }
    ).token;
    const plus = (ms: number) => new Date(NOW.getTime() + ms);
    expect(await e.svc.resolve(token, plus(10 * 60_000))).not.toBeNull();
    // lastSeenAt обновился на 10-й минуте, значит 35-я минута - ещё внутри idle
    expect(await e.svc.resolve(token, plus(35 * 60_000))).not.toBeNull();
    expect(await e.svc.resolve(token, plus(66 * 60_000))).toBeNull();
    expect(await e.svc.resolve('bad', NOW)).toBeNull();
    expect(await e.svc.resolve(null, NOW)).toBeNull();

    const e2 = authEnv();
    const l2 = await login(e2);
    const t2 = (
      (await e2.svc.finishLogin('code', l2.state, l2.binder, NOW)) as {
        token: string;
      }
    ).token;
    e2.sessions[0].lastSeenAt = plus(8 * 3_600_000 - 1000);
    expect(await e2.svc.resolve(t2, plus(8 * 3_600_000 + 1000))).toBeNull();

    const e3 = authEnv();
    const l3 = await login(e3);
    const t3 = (
      (await e3.svc.finishLogin('code', l3.state, l3.binder, NOW)) as {
        token: string;
      }
    ).token;
    const p3 = await e3.svc.resolve(t3, NOW);
    await e3.svc.logout(p3 as never, NOW);
    expect(await e3.svc.resolve(t3, NOW)).toBeNull();

    const e4 = authEnv();
    const l4 = await login(e4);
    const t4 = (
      (await e4.svc.finishLogin('code', l4.state, l4.binder, NOW)) as {
        token: string;
      }
    ).token;
    (e4.config.admin.allowedDiscordIds as string[]).length = 0;
    expect(await e4.svc.resolve(t4, NOW)).toBeNull();
  });

  it('аудит: отказ и вход записываются без токенов', async () => {
    const e = authEnv();
    e.identity.mfaEnabled = false;
    const l = await login(e);
    await e.svc.finishLogin('code', l.state, l.binder, NOW);
    expect(e.audit[0]).toMatchObject({
      action: 'login_denied',
      detail: 'mfa_required',
      actor: ADMIN_ID,
    });
    expect(JSON.stringify(e.audit)).not.toContain(l.state);
  });
});

/* ---------- CSRF / Origin / сессия в охране ---------- */

describe('admin guard: CSRF и Origin', () => {
  async function setup() {
    const e = authEnv();
    const l = await login(e);
    const token = (
      (await e.svc.finishLogin('code', l.state, l.binder, NOW)) as {
        token: string;
      }
    ).token;
    const redis = { hit: jest.fn(() => Promise.resolve(0)) };
    const guard = new GiveawayAdminGuard(
      e.svc,
      redis as never,
      e.auditSvc as never,
      e.config,
    );
    const ctx = (
      method: string,
      headers: Record<string, string>,
      cookie: string | undefined,
    ) => {
      const req: Record<string, unknown> = {
        method,
        ip: '1.2.3.4',
        headers: { ...headers, ...(cookie ? { cookie } : {}) },
      };
      return {
        req,
        ctx: {
          switchToHttp: () => ({
            getRequest: () => req,
            getResponse: () => ({ setHeader: jest.fn() }),
          }),
        } as never,
      };
    };
    return { e, token, guard, ctx };
  }

  it('GET с сессией проходит, без cookie - 401', async () => {
    const s = await setup();
    await expect(
      s.guard.canActivate(s.ctx('GET', {}, `gw_admin=${s.token}`).ctx),
    ).resolves.toBe(true);
    await expect(
      s.guard.canActivate(s.ctx('GET', {}, undefined).ctx),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('POST: нужны точный Origin и CSRF-заголовок', async () => {
    const s = await setup();
    const csrf = s.e.svc.csrfFor(s.token);
    const cookie = `gw_admin=${s.token}`;
    const ok = s.ctx(
      'POST',
      { origin: ORIGIN, 'x-giveaway-csrf': csrf },
      cookie,
    );
    await expect(s.guard.canActivate(ok.ctx)).resolves.toBe(true);
    const bad: [Record<string, string>][] = [
      [{ 'x-giveaway-csrf': csrf }],
      [{ origin: 'https://evil.example', 'x-giveaway-csrf': csrf }],
      [{ origin: ORIGIN }],
      [{ origin: ORIGIN, 'x-giveaway-csrf': '0'.repeat(64) }],
      [{ origin: ORIGIN, 'x-giveaway-csrf': 'zz' }],
    ];
    for (const [h] of bad) {
      const err = await s.guard
        .canActivate(s.ctx('POST', h, cookie).ctx)
        .catch((x: unknown) => x);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(403);
      expect((err as HttpException).getResponse()).toEqual({ error: 'csrf' });
    }
    expect(s.e.audit.filter((a) => a.action === 'csrf_denied')).toHaveLength(
      bad.length,
    );
  });
});

/* ---------- розыгрыш: фейковая БД ---------- */

interface Draw extends Record<string, unknown> {
  id: string;
  context: string;
  status: string;
  revision: number;
}

function drawEnv(opts: { cutoffAt?: Date; prizes?: boolean } = {}) {
  const draws: Draw[] = [];
  const winners: Record<string, unknown>[] = [];
  let seq = 0;
  const entries = [
    ['K417', 'Alex'],
    ['A001', 'Bob_1'],
    ['M250', 'Cat'],
    ['Z999', 'Dave'],
    ['B002', 'Eve'],
    ['C333', 'Finn'],
    ['P777', 'Gus'],
    ['T100', 'Hana'],
    ['H808', 'Ivy'],
    ['W640', 'Jack'],
  ].map(([ticket, playerName], i) => ({
    ticket,
    playerName,
    playerUuid: `00000000-0000-4000-8000-0000000000${String(i + 1).padStart(2, '0')}`,
  }));
  const withWinners = (d: Draw | undefined, include?: unknown) =>
    d === undefined
      ? null
      : include
        ? { ...d, winners: winners.filter((w) => w.drawId === d.id) }
        : d;
  const tx: Record<string, unknown> = {
    $queryRaw: jest.fn(() => Promise.resolve([])),
    giveawayDraw: {
      findUnique: jest.fn(
        ({
          where,
          include,
        }: {
          where: { context: string };
          include?: unknown;
        }) =>
          Promise.resolve(
            withWinners(
              draws.find((d) => d.context === where.context),
              include,
            ),
          ),
      ),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        if (draws.some((d) => d.context === data.context)) {
          return Promise.reject(
            Object.assign(new Error('u'), { code: 'P2002' }),
          );
        }
        const d = {
          id: `d${++seq}`,
          revision: 1,
          orderJson: null,
          prizesJson: null,
          seedHex: null,
          algorithm: null,
          calculatedAt: null,
          broadcastAt: null,
          ...data,
        } as unknown as Draw;
        draws.push(d);
        return Promise.resolve(d);
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
          if (!d) return Promise.resolve({ count: 0 });
          for (const [k, v] of Object.entries(data)) {
            if (v && typeof v === 'object' && 'increment' in v) {
              (d as Record<string, number>)[k] += (
                v as { increment: number }
              ).increment;
            } else d[k] = v;
          }
          return Promise.resolve({ count: 1 });
        },
      ),
      update: jest.fn(({ where }: { where: { id: string } }) => {
        const d = draws.find((x) => x.id === where.id) as Draw;
        d.revision += 1;
        return Promise.resolve(d);
      }),
    },
    giveawayWinner: {
      createMany: jest.fn(({ data }: { data: Record<string, unknown>[] }) => {
        for (const w of data) {
          winners.push({
            id: `w${++seq}`,
            createdAt: new Date(2026, 0, 1, 0, 0, seq),
            disqualifyReason: null,
            replacesWinnerId: null,
            ...w,
          });
        }
        return Promise.resolve({ count: data.length });
      }),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        const w = {
          id: `w${++seq}`,
          createdAt: new Date(2026, 0, 1, 0, 0, seq),
          disqualifyReason: null,
          replacesWinnerId: null,
          ...data,
        };
        winners.push(w);
        return Promise.resolve(w);
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
          if (!w) return Promise.resolve({ count: 0 });
          Object.assign(w, data);
          return Promise.resolve({ count: 1 });
        },
      ),
    },
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn((fn: (t: unknown) => Promise<unknown>) => fn(tx)),
  };
  const data = {
    allTickets: jest.fn(() => Promise.resolve(entries)),
    totalMinutes: jest.fn(() => Promise.resolve(new Map<string, number>())),
  };
  const prizes = {
    ordered: jest.fn(() =>
      Promise.resolve(
        opts.prizes === false
          ? []
          : [
              { name: 'Клавиатура', quantity: 2, imageFile: 'keyboard.png' },
              { name: 'Микрофон', quantity: 1, imageFile: null },
            ],
      ),
    ),
  };
  const settings = {
    get: jest.fn(() =>
      Promise.resolve({
        thresholdMinutes: 3000,
        cutoffAt: opts.cutoffAt ?? new Date('2026-12-30T20:59:59.000Z'),
      }),
    ),
  };
  const audit: Record<string, unknown>[] = [];
  const auditSvc = {
    record: jest.fn((e: Record<string, unknown>) => {
      audit.push(e);
      return Promise.resolve();
    }),
  };
  const stream = { publish: jest.fn(() => Promise.resolve()) };
  const svc = new GiveawayDrawService(
    prisma as never,
    data as never,
    prizes as never,
    settings as never,
    auditSvc as never,
    stream as never,
  );
  return { svc, draws, winners, audit, stream, data };
}

describe('розыгрыш: заморозка, «Рассчитать» один раз, дисквалификация', () => {
  it('live: заморозка до отсечки запрещена; после - снимок и хэш из вектора', async () => {
    const e = drawEnv();
    await expect(
      e.svc.freeze('live', ADMIN_ID, new Date('2026-12-30T20:00:00.000Z')),
    ).rejects.toMatchObject({ response: { error: 'cutoff_not_reached' } });
    const s = await e.svc.freeze('live', ADMIN_ID, NOW);
    expect(s.status).toBe('frozen');
    expect(s.snapshotHash).toBe(
      '0436be4eeadab96d00085c89cc04a3bfb2880edbb38e1ba5d9ca444fb8ce1996',
    );
    // идемпотентно
    const again = await e.svc.freeze('live', ADMIN_ID, NOW);
    expect(again.snapshotHash).toBe(s.snapshotHash);
    expect(e.draws).toHaveLength(1);
  });

  it('«Рассчитать» ровно один раз; неверный хэш и фраза отклоняются', async () => {
    const e = drawEnv();
    const frozen = await e.svc.freeze('live', ADMIN_ID, NOW);
    const hash = frozen.snapshotHash as string;
    await expect(
      e.svc.calculate('live', hash, 'нет', ADMIN_ID, NOW),
    ).rejects.toMatchObject({ response: { error: 'invalid_body' } });
    await expect(
      e.svc.calculate('live', 'f'.repeat(64), 'РАССЧИТАТЬ', ADMIN_ID, NOW),
    ).rejects.toMatchObject({ response: { error: 'snapshot_mismatch' } });
    expect(e.draws[0].status).toBe('frozen');

    const first = await e.svc.calculate(
      'live',
      hash,
      'РАССЧИТАТЬ',
      ADMIN_ID,
      NOW,
    );
    expect(first.status).toBe('calculated');
    expect(first.winners).toHaveLength(3);
    const seed = first.seed;
    await expect(
      e.svc.calculate('live', hash, 'РАССЧИТАТЬ', ADMIN_ID, NOW),
    ).rejects.toMatchObject({ response: { error: 'already_calculated' } });
    expect(e.draws[0].seedHex).toBe(seed);
    expect(e.winners).toHaveLength(3);
    // воспроизводимость по опубликованному зерну
    const { drawOrder } = await import('./giveaway-draw');
    const entries = JSON.parse(e.draws[0].snapshotJson as string).tickets;
    expect(
      drawOrder(entries, Buffer.from(seed as string, 'hex'), hash).map(
        (x) => x.ticket,
      ),
    ).toEqual(first.order.map((o) => o.ticket));
  });

  it('нет заморозки: not_frozen; нет призов в live: no_prizes', async () => {
    const e = drawEnv();
    await expect(
      e.svc.calculate('live', 'a'.repeat(64), 'РАССЧИТАТЬ', ADMIN_ID, NOW),
    ).rejects.toMatchObject({ response: { error: 'not_frozen' } });
    const n = drawEnv({ prizes: false });
    const f = await n.svc.freeze('live', ADMIN_ID, NOW);
    await expect(
      n.svc.calculate(
        'live',
        f.snapshotHash as string,
        'РАССЧИТАТЬ',
        ADMIN_ID,
        NOW,
      ),
    ).rejects.toMatchObject({ response: { error: 'no_prizes' } });
  });

  it('публично до эфира расчёт и зерно не видны, после - видны; UUID нет', async () => {
    const e = drawEnv();
    const f = await e.svc.freeze('live', ADMIN_ID, NOW);
    await e.svc.calculate(
      'live',
      f.snapshotHash as string,
      'РАССЧИТАТЬ',
      ADMIN_ID,
      NOW,
    );
    const pre = (await e.svc.publicResults('live')) as Record<string, unknown>;
    expect(pre.state).toBe('frozen');
    expect(pre.seed).toBeUndefined();
    expect(pre.winners).toBeUndefined();
    await expect(e.svc.broadcast('live', ADMIN_ID, NOW)).resolves.toMatchObject(
      { status: 'broadcast' },
    );
    await expect(e.svc.broadcast('live', ADMIN_ID, NOW)).rejects.toMatchObject({
      response: { error: 'already_broadcast' },
    });
    const pub = (await e.svc.publicResults('live')) as Record<string, unknown>;
    expect(pub.state).toBe('results');
    expect(pub.seed).toBe(e.draws[0].seedHex);
    expect(JSON.stringify(pub)).not.toContain('00000000-0000-4000');
    expect(e.stream.publish).toHaveBeenCalledTimes(1);
    expect(e.stream.publish).toHaveBeenCalledWith('live', 'results', {
      revision: 3,
      state: 'results',
    });
  });

  it('дисквалификация: замена по порядку, итоги и SSE после эфира', async () => {
    const e = drawEnv();
    const f = await e.svc.freeze('live', ADMIN_ID, NOW);
    const calc = await e.svc.calculate(
      'live',
      f.snapshotHash as string,
      'РАССЧИТАТЬ',
      ADMIN_ID,
      NOW,
    );
    // случайное зерно: проверяем по фактическому порядку
    const order = calc.order.map((o) => o.ticket);
    const w1 = calc.winners.find((w) => w.place === 1) as { id: string };
    await e.svc.broadcast('live', ADMIN_ID, NOW);
    e.stream.publish.mockClear();

    const r1 = await e.svc.disqualify(
      'live',
      w1.id,
      'нарушение',
      ADMIN_ID,
      NOW,
    );
    expect(r1.replacement?.ticket).toBe(order[3]);
    expect(r1.replacement?.place).toBe(1);
    expect(r1.replacement?.status).toBe('active');
    expect(e.stream.publish).toHaveBeenCalledTimes(1);

    await expect(
      e.svc.disqualify('live', w1.id, 'ещё раз', ADMIN_ID, NOW),
    ).rejects.toMatchObject({ response: { error: 'winner_not_active' } });

    // дисквалификация замены: следующий неиспользованный индекс
    const r2 = await e.svc.disqualify(
      'live',
      (r1.replacement as { id: string }).id,
      'ещё',
      ADMIN_ID,
      NOW,
    );
    expect(r2.replacement?.ticket).toBe(order[4]);
    const pub = (await e.svc.publicResults('live')) as unknown as {
      winners: { place: number; ticket: string }[];
      disqualified: { ticket: string }[];
    };
    expect(pub.winners.find((w) => w.place === 1)?.ticket).toBe(order[4]);
    expect(pub.disqualified.map((d) => d.ticket).sort()).toEqual(
      [order[0], order[3]].sort(),
    );
    expect(JSON.stringify(pub.disqualified)).not.toContain('нарушение');
    expect(e.draws[0].revision).toBeGreaterThan(3);
  });

  it('замены кончились: место пусто', async () => {
    const e = drawEnv();
    // единственный приз x10 на 10 билетов
    const f = await e.svc.freeze('test', ADMIN_ID, NOW);
    const calc = await e.svc.calculate(
      'test',
      f.snapshotHash as string,
      'РАССЧИТАТЬ',
      ADMIN_ID,
      NOW,
    );
    // демо-призы: 3 места из 10 билетов; дисквалифицируем 8 раз подряд
    let current = calc.winners.find((w) => w.place === 1) as { id: string };
    for (let i = 0; i < 7; i++) {
      const r = await e.svc.disqualify(
        'test',
        current.id,
        'тест',
        ADMIN_ID,
        NOW,
      );
      current = r.replacement as { id: string };
      expect(current).not.toBeNull();
    }
    const last = await e.svc.disqualify(
      'test',
      current.id,
      'тест',
      ADMIN_ID,
      NOW,
    );
    expect(last.replacement).toBeNull();
  });

  it('тест и live изолированы в итогах по контексту', async () => {
    const e = drawEnv();
    const f = await e.svc.freeze('test', ADMIN_ID, NOW);
    await e.svc.calculate(
      'test',
      f.snapshotHash as string,
      'РАССЧИТАТЬ',
      ADMIN_ID,
      NOW,
    );
    await e.svc.broadcast('test', ADMIN_ID, NOW);
    const live = (await e.svc.publicResults('live')) as Record<string, unknown>;
    expect(live).toMatchObject({ state: 'idle', test: false });
    const test = (await e.svc.publicResults('test')) as Record<string, unknown>;
    expect(test).toMatchObject({ state: 'results', test: true });
    expect(e.stream.publish).toHaveBeenCalledWith(
      'test',
      'results',
      expect.anything(),
    );
    expect(e.stream.publish).not.toHaveBeenCalledWith(
      'live',
      expect.anything(),
      expect.anything(),
    );
  });
});

/* ---------- тестовый режим: изоляция и запрет ручного времени в live ---------- */

describe('тестовый режим', () => {
  function testEnv() {
    const grants: Record<string, unknown>[] = [];
    const tickets: Record<string, unknown>[] = [];
    const realWrites = jest.fn();
    const prisma = {
      giveawayTestTimeGrant: {
        create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
          grants.push(data);
          return Promise.resolve(data);
        }),
        aggregate: jest.fn(({ where }: { where: { playerUuid: string } }) =>
          Promise.resolve({
            _sum: {
              minutes:
                grants
                  .filter((g) => g.playerUuid === where.playerUuid)
                  .reduce((a, g) => a + (g.minutes as number), 0) || null,
            },
          }),
        ),
        deleteMany: jest.fn(() => {
          grants.length = 0;
          return Promise.resolve({});
        }),
      },
      giveawayTestTicket: {
        findUnique: jest.fn(({ where }: { where: { playerUuid: string } }) =>
          Promise.resolve(
            tickets.find((t) => t.playerUuid === where.playerUuid) ?? null,
          ),
        ),
        create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
          tickets.push(data);
          return Promise.resolve(data);
        }),
        deleteMany: jest.fn(() => {
          tickets.length = 0;
          return Promise.resolve({});
        }),
      },
      giveawayDraw: { deleteMany: jest.fn(() => Promise.resolve({})) },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
      // реальные таблицы: любое обращение фиксируется
      giveawayMinute: new Proxy({}, { get: () => realWrites }),
      giveawayTicket: new Proxy({}, { get: () => realWrites }),
      giveawayPlayer: new Proxy({}, { get: () => realWrites }),
      giveawayCode: new Proxy({}, { get: () => realWrites }),
      giveawaySettings: new Proxy({}, { get: () => realWrites }),
    };
    const stream = { publish: jest.fn(() => Promise.resolve()) };
    const settings = {
      get: jest.fn(() => Promise.resolve({ thresholdMinutes: 100 })),
    };
    const svc = new GiveawayTestService(
      prisma as never,
      settings as never,
      stream as never,
    );
    return { svc, grants, tickets, realWrites, stream, prisma };
  }

  it('ручное время в live запрещено и ничего не пишет', async () => {
    const t = testEnv();
    await expect(
      t.svc.grantTime('live', 'Alex', 100, undefined, ADMIN_ID),
    ).rejects.toMatchObject({
      response: { error: 'manual_time_disabled_in_live' },
    });
    expect(t.prisma.giveawayTestTimeGrant.create).not.toHaveBeenCalled();
    expect(t.realWrites).not.toHaveBeenCalled();
  });

  it('тест: начисление, порог, билет, повтор даёт тот же билет, реальные таблицы не тронуты', async () => {
    const t = testEnv();
    await t.svc.grantTime('test', 'Alex', 60, '2026-11-22', ADMIN_ID, NOW);
    await expect(t.svc.issueTicket('Alex')).rejects.toMatchObject({
      response: { error: 'not_enough_time' },
    });
    await t.svc.grantTime('test', 'Alex', 40, undefined, ADMIN_ID, NOW);
    const a = await t.svc.issueTicket('Alex');
    const b = await t.svc.issueTicket('Alex');
    expect(a.ticket).toBe(b.ticket);
    expect(a.ticket).toMatch(/^[A-Z][0-9]{3}$/);
    expect(t.grants[0].playerUuid).toBe(testUuid('Alex'));
    expect(testUuid('Alex')).toMatch(/^00000000-0000-4000-8000-[0-9a-f]{12}$/);
    expect(t.realWrites).not.toHaveBeenCalled();
  });

  it('лимит минут на ник и плохой ник', async () => {
    const t = testEnv();
    await expect(
      t.svc.grantTime('test', 'bad name!', 5, undefined, ADMIN_ID),
    ).rejects.toMatchObject({ response: { error: 'invalid_body' } });
    await t.svc.grantTime('test', 'Big', 1_000_000, undefined, ADMIN_ID, NOW);
    await expect(
      t.svc.grantTime('test', 'Big', 1, undefined, ADMIN_ID, NOW),
    ).rejects.toMatchObject({ response: { error: 'too_many_minutes' } });
  });

  it('seed и reset: только тестовые таблицы, событие reset в тестовый канал', async () => {
    const t = testEnv();
    const r = await t.svc.seed(5, ADMIN_ID);
    expect(r.created).toBe(5);
    expect(t.tickets).toHaveLength(5);
    await t.svc.reset();
    expect(t.tickets).toHaveLength(0);
    expect(t.grants).toHaveLength(0);
    expect(t.prisma.giveawayDraw.deleteMany).toHaveBeenCalledWith({
      where: { context: 'test' },
    });
    expect(t.stream.publish).toHaveBeenCalledWith('test', 'reset', {});
    expect(t.realWrites).not.toHaveBeenCalled();
  });
});

/* ---------- SSE ---------- */

describe('SSE-эфир', () => {
  function fakeRes() {
    const chunks: string[] = [];
    const handlers: Record<string, () => void> = {};
    return {
      chunks,
      handlers,
      res: {
        status: jest.fn(),
        setHeader: jest.fn(),
        flushHeaders: jest.fn(),
        write: jest.fn((s: string) => {
          chunks.push(s);
          return true;
        }),
        end: jest.fn(),
        on: (ev: string, fn: () => void) => {
          handlers[ev] = fn;
        },
      },
    };
  }
  const req = () => ({ on: jest.fn() });

  function streamEnv(subscribed = false) {
    let listener: ((m: string) => void) | null = null;
    const redis = {
      publish: jest.fn((m: string) => {
        if (listener && subscribed) listener(m);
        return Promise.resolve();
      }),
      subscribe: jest.fn((l: (m: string) => void) => {
        listener = l;
        return Promise.resolve(() => undefined);
      }),
      hasSubscriber: jest.fn(() => subscribed),
    };
    const svc = new GiveawayStreamService(redis as never);
    return { svc, redis };
  }

  it('подключение: заголовки, retry и ready', async () => {
    const { svc } = streamEnv();
    const c = fakeRes();
    expect(
      await svc.attach(req() as never, c.res as never, 'live', 'ip', 7),
    ).toBe(true);
    expect(c.res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'text/event-stream; charset=utf-8',
    );
    expect(c.res.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'no-store, no-transform',
    );
    expect(c.chunks[0]).toBe('retry: 5000\n\n');
    expect(c.chunks[1]).toBe('event: ready\ndata: {"revision":7}\n\n');
    svc.onModuleDestroy();
  });

  it('публикация: live-клиент получает results, но не тестовый reset', async () => {
    const { svc } = streamEnv(true);
    const live = fakeRes();
    const test = fakeRes();
    await svc.attach(req() as never, live.res as never, 'live', 'a', 1);
    await svc.attach(req() as never, test.res as never, 'test', 'b', 1);
    await svc.publish('live', 'results', { revision: 2, state: 'results' });
    await svc.publish('test', 'reset', {});
    expect(live.chunks.join('')).toContain(
      'event: results\ndata: {"revision":2,"state":"results"}',
    );
    expect(live.chunks.join('')).not.toContain('event: reset');
    expect(test.chunks.join('')).toContain('event: reset\ndata: {}');
    expect(test.chunks.join('')).not.toContain('event: results');
    svc.onModuleDestroy();
  });

  it('без подписчика Redis публикация идёт локально, без дублей при подписке', async () => {
    const local = streamEnv(false);
    const c = fakeRes();
    await local.svc.attach(req() as never, c.res as never, 'live', 'a', 1);
    // Redis недоступен (нет подписчика): локальная рассылка
    c.chunks.length = 0;
    await local.svc.publish('live', 'results', {
      revision: 3,
      state: 'results',
    });
    const count = c.chunks.filter((x) => x.startsWith('event: results')).length;
    expect(count).toBe(1);
    local.svc.onModuleDestroy();
  });

  it('лимит соединений на адрес и освобождение при закрытии', async () => {
    const { svc } = streamEnv();
    const conns = [];
    for (let i = 0; i < 6; i++) {
      const c = fakeRes();
      expect(
        await svc.attach(req() as never, c.res as never, 'live', 'ip', 1),
      ).toBe(true);
      conns.push(c);
    }
    const extra = fakeRes();
    expect(
      await svc.attach(req() as never, extra.res as never, 'live', 'ip', 1),
    ).toBe(false);
    expect(svc.clientCount()).toBe(6);
    conns[0].handlers.close();
    expect(svc.clientCount()).toBe(5);
    expect(
      await svc.attach(req() as never, extra.res as never, 'live', 'ip', 1),
    ).toBe(true);
    svc.onModuleDestroy();
  });
});
