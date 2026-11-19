import { HttpException } from '@nestjs/common';
import * as codesLib from './giveaway-codes';
import {
  DUMMY_CODE,
  formatCode,
  generateCode,
  generateTicket,
  normalizeCode,
} from './giveaway-codes';
import { parseProgressBody, parseRedeemBody } from './giveaway-bodies';
import {
  GiveawayCodesService,
  GiveawayLimitError,
} from './giveaway-codes.service';
import { readCookie } from './giveaway-public.controller';
import { GiveawayTicketsService } from './giveaway-tickets.service';
import { GiveawayConfig, readGiveawayConfig } from './giveaway.config';
import {
  CODE_ALPHABET,
  GIVEAWAY_SIGNED_PATHS,
  GIVEAWAY_SIGN_PATH,
  TICKET_LETTERS,
} from './giveaway.constants';

const SECRET = 'test-master-secret-synthetic-0123456789-abcdef';
const U1 = '11111111-2222-4333-8444-555555555555';
const U2 = '22222222-2222-4333-8444-555555555555';
const SERVER = 'anarchy-new-era';
const NOW = new Date('2026-12-01T10:00:00.000Z');
const settingsValue = {
  thresholdMinutes: 3000,
  startAt: new Date('2026-11-21T21:00:00.000Z'),
  cutoffAt: new Date('2026-12-30T20:59:59.000Z'),
  timezone: 'Europe/Moscow',
  allowedServers: [SERVER],
};

interface CodeRow {
  id: string;
  codeHash: string;
  sessionHash: string;
  createdAt: Date;
  expiresAt: Date;
  redeemedAt: Date | null;
  revokedAt: Date | null;
  ticketId: string | null;
  lastAttemptAt?: Date | null;
  lastAttemptMinutes?: number | null;
  lastAttemptThreshold?: number | null;
}
interface TicketRow {
  id: string;
  ticket: string;
  playerUuid: string;
  playerName: string;
  issuedAt: Date;
  trackingToken?: string | null;
}

function matches(row: CodeRow, where: Record<string, unknown>): boolean {
  for (const [k, v] of Object.entries(where)) {
    const cur = (row as unknown as Record<string, unknown>)[k];
    if (v !== null && typeof v === 'object' && 'gt' in (v as object)) {
      if (!((cur as Date).getTime() > (v as { gt: Date }).gt.getTime())) {
        return false;
      }
    } else if (v === null) {
      if (cur !== null) return false;
    } else if (cur !== v) return false;
  }
  return true;
}

function makeEnv(minutes = 3000) {
  let codes: CodeRow[] = [];
  let tickets: TicketRow[] = [];
  let seq = 0;
  const minuteWhere: unknown[] = [];
  const holder: { db?: unknown } = {};
  const db = {
    giveawayCode: {
      updateMany: jest.fn(
        ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: Partial<CodeRow>;
        }) => {
          const hit = codes.filter((r) => matches(r, where));
          hit.forEach((r) => Object.assign(r, data));
          return Promise.resolve({ count: hit.length });
        },
      ),
      create: jest.fn(({ data }: { data: Partial<CodeRow> }) => {
        const row = {
          id: `c${++seq}`,
          redeemedAt: null,
          revokedAt: null,
          ticketId: null,
          ...data,
        } as CodeRow;
        codes.push(row);
        return Promise.resolve(row);
      }),
      findFirst: jest.fn(({ where }: { where: { sessionHash: string } }) => {
        const rows = codes
          .filter((r) => r.sessionHash === where.sessionHash)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        const r = rows[0];
        if (r === undefined) return Promise.resolve(null);
        return Promise.resolve({
          ...r,
          ticket: tickets.find((t) => t.id === r.ticketId) ?? null,
        });
      }),
    },
    giveawayTicket: {
      create: jest.fn(({ data }: { data: Omit<TicketRow, 'id'> }) => {
        if (
          tickets.some(
            (t) => t.ticket === data.ticket || t.playerUuid === data.playerUuid,
          )
        ) {
          return Promise.reject(
            Object.assign(new Error('dup'), { code: 'P2002' }),
          );
        }
        const row = { id: `t${++seq}`, ...data };
        tickets.push(row);
        return Promise.resolve(row);
      }),
      findUnique: jest.fn(({ where }: { where: { playerUuid: string } }) =>
        Promise.resolve(
          tickets.find((t) => t.playerUuid === where.playerUuid) ?? null,
        ),
      ),
      findMany: jest.fn(
        ({ where }: { where: { playerUuid: { in: string[] } } }) =>
          Promise.resolve(
            tickets.filter((t) => where.playerUuid.in.includes(t.playerUuid)),
          ),
      ),
      count: jest.fn(() => Promise.resolve(tickets.length)),
    },
    giveawayMinute: {
      count: jest.fn((a: { where: unknown }) => {
        minuteWhere.push(a.where);
        return Promise.resolve(minutes);
      }),
      groupBy: jest.fn(() =>
        Promise.resolve([{ playerUuid: U1, _count: { _all: minutes } }]),
      ),
    },
    $transaction: jest.fn(
      async (fn: (t: unknown) => Promise<unknown>): Promise<unknown> => {
        const snap = { c: codes.map((r) => ({ ...r })), t: [...tickets] };
        try {
          return await fn(holder.db);
        } catch (e) {
          codes = snap.c;
          tickets = snap.t;
          throw e;
        }
      },
    ),
  };
  holder.db = db;
  const limits = new Map<string, number>();
  const redis = {
    hit: jest.fn((scope: string, subject: string, limit: number) => {
      const k = `${scope}|${subject}`;
      const n = (limits.get(k) ?? 0) + 1;
      limits.set(k, n);
      return Promise.resolve(n <= limit ? 0 : 30);
    }),
    acquireLock: jest.fn().mockResolvedValue(true),
    releaseLock: jest.fn().mockResolvedValue(undefined),
  };
  const settings = {
    get: jest.fn().mockResolvedValue(settingsValue),
    describe: jest.fn().mockReturnValue({ thresholdMinutes: 3000 }),
  };
  const config: GiveawayConfig = {
    ...readGiveawayConfig({ get: () => undefined as never }),
    enabled: true,
    masterSecret: Buffer.from(SECRET),
  };
  const codesSvc = new GiveawayCodesService(
    db as never,
    redis as never,
    settings as never,
    config,
  );
  const ticketsSvc = new GiveawayTicketsService(
    db as never,
    redis as never,
    settings as never,
    codesSvc,
  );
  return {
    db,
    redis,
    codesSvc,
    ticketsSvc,
    config,
    minuteWhere,
    rows: () => ({ codes, tickets }),
  };
}

const body = (code: string, uuid = U1, name = 'Steve') => ({
  code,
  playerUuid: uuid,
  playerName: name,
});

describe('giveaway фаза 2: коды', () => {
  it('формат XXXX-XXXX-XXXX-XXXX, алфавит без I L O U, 32 символа', () => {
    expect(CODE_ALPHABET).toHaveLength(32);
    expect(new Set(CODE_ALPHABET).size).toBe(32);
    for (const bad of 'ILOU') expect(CODE_ALPHABET).not.toContain(bad);
    for (let i = 0; i < 200; i++) {
      const c = generateCode();
      expect(c).toMatch(/^[0-9A-HJKMNP-TV-Z]{16}$/);
      expect(formatCode(c)).toMatch(/^([0-9A-Z]{4}-){3}[0-9A-Z]{4}$/);
    }
  });
  it('нормализация: регистр, дефисы, правила Crockford, U невалиден', () => {
    expect(normalizeCode('abcd-efgh-jkmn-pqrs')).toBe('ABCDEFGHJKMNPQRS');
    expect(normalizeCode('oooo iiii llll 0000')).toBe('0000111111110000');
    expect(normalizeCode('ABCD-EFGH-JKMN-PQRU')).toBeNull();
    expect(normalizeCode('ABCD')).toBeNull();
    expect(normalizeCode(42)).toBeNull();
  });
  it('билет: буква без I и O + 3 цифры', () => {
    expect(TICKET_LETTERS).toHaveLength(24);
    for (let i = 0; i < 500; i++) {
      const t = generateTicket();
      expect(t).toMatch(/^[A-HJ-NP-Z][0-9]{3}$/);
    }
  });
  it('выдача: хранится только HMAC-хэш, TTL 10 минут, ответ с кодом один раз', async () => {
    const e = makeEnv();
    const r = await e.codesSvc.issue(null, '203.0.113.5', undefined, NOW);
    expect(r.ttlSeconds).toBe(600);
    expect(r.expiresAt.getTime() - NOW.getTime()).toBe(600_000);
    expect(r.isNewSession).toBe(true);
    const row = e.rows().codes[0];
    expect(row.codeHash).toMatch(/^[0-9a-f]{64}$/);
    const plain = r.code.replace(/-/g, '');
    expect(JSON.stringify(e.rows().codes)).not.toContain(plain);
    expect(JSON.stringify(e.rows().codes)).not.toContain(r.sessionToken);
    expect(row.codeHash).toBe(e.codesSvc.codeHash(plain));
    expect(row.expiresAt).toEqual(r.expiresAt);
  });
  it('один активный код на сессию: новый аннулирует прежний', async () => {
    const e = makeEnv();
    const a = await e.codesSvc.issue(null, '203.0.113.5', undefined, NOW);
    const b = await e.codesSvc.issue(
      a.sessionToken,
      '203.0.113.5',
      undefined,
      NOW,
    );
    expect(b.isNewSession).toBe(false);
    const [r1, r2] = e.rows().codes;
    expect(r1.revokedAt).not.toBeNull();
    expect(r2.revokedAt).toBeNull();
    // Прежний код погасить нельзя.
    const old = await e.ticketsSvc.redeem(SERVER, body(a.code), NOW);
    expect(old).toEqual({ status: 'invalid_code' });
  });
  it('ключи кодов и сессий различны', () => {
    const e = makeEnv();
    expect(e.codesSvc.codeHash('A'.repeat(16))).not.toBe(
      e.codesSvc.sessionHash('A'.repeat(16)),
    );
  });
  it('лимиты: превышение по адресу, /64 и сессии даёт rate_limited', async () => {
    const e = makeEnv();
    e.redis.hit.mockResolvedValueOnce(0).mockResolvedValueOnce(42);
    await expect(
      e.codesSvc.issue(null, '203.0.113.5', undefined, NOW),
    ).rejects.toMatchObject({ kind: 'rate_limited', retryAfterS: 42 });
    expect(e.rows().codes).toHaveLength(0);
    const scopes = e.redis.hit.mock.calls.map((c) => c[0]);
    // L3: по очереди; отказ на втором шаге не расходует третий.
    expect(scopes).toEqual(['codes-net', 'codes-ip']);
  });
  it('IPv6 в одной /64 делят общий ключ подсети', async () => {
    const e = makeEnv();
    await e.codesSvc.issue(null, '2001:db8:1:2::1', undefined, NOW);
    await e.codesSvc.issue(null, '2001:db8:1:2:ffff::9', undefined, NOW);
    const net = e.redis.hit.mock.calls.filter((c) => c[0] === 'codes-net');
    expect(net[0][1]).toBe(net[1][1]);
    const ip = e.redis.hit.mock.calls.filter((c) => c[0] === 'codes-ip');
    expect(ip[0][1]).not.toBe(ip[1][1]);
  });
  it('капча: включена без доступного сервиса - fail closed', async () => {
    const e = makeEnv();
    const svc = new GiveawayCodesService(
      e.db as never,
      e.redis as never,
      { get: jest.fn() } as never,
      { ...e.config, captchaEnabled: true },
    );
    await expect(
      svc.issue(null, '203.0.113.5', undefined, NOW),
    ).rejects.toBeInstanceOf(GiveawayLimitError);
  });
  it('status: none -> pending -> redeemed; expired по TTL', async () => {
    const e = makeEnv();
    expect(await e.codesSvc.status(null, NOW)).toEqual({ status: 'none' });
    const a = await e.codesSvc.issue(null, '203.0.113.5', undefined, NOW);
    expect(await e.codesSvc.status(a.sessionToken, NOW)).toEqual({
      status: 'pending',
      expiresAt: a.expiresAt.toISOString(),
    });
    expect(
      await e.codesSvc.status(
        a.sessionToken,
        new Date(NOW.getTime() + 601_000),
      ),
    ).toEqual({ status: 'expired' });
    const r = await e.ticketsSvc.redeem(SERVER, body(a.code), NOW);
    expect(r.status).toBe('issued');
    expect(await e.codesSvc.status(a.sessionToken, NOW)).toEqual({
      status: 'redeemed',
      ticket: (r as { ticket: string }).ticket,
      playerName: 'Steve',
      issuedAt: NOW.toISOString(),
      trackingToken: expect.stringMatching(/^[A-Za-z0-9_-]{22,}$/) as string,
    });
  });
  it('status: чужая сессия не видит коды (хэш другой)', async () => {
    const e = makeEnv();
    await e.codesSvc.issue(null, '203.0.113.5', undefined, NOW);
    const other = GiveawayCodesService.newSessionToken();
    expect(await e.codesSvc.status(other, NOW)).toEqual({ status: 'none' });
  });
  it('cookie читается из заголовка', () => {
    expect(readCookie('a=1; gw_session=XYZ; b=2', 'gw_session')).toBe('XYZ');
    expect(readCookie(undefined, 'gw_session')).toBeNull();
    expect(readCookie('a=1', 'gw_session')).toBeNull();
  });
});

describe('giveaway фаза 2: redeem', () => {
  it('успех: билет создан, код погашен, ник и UUID привязаны', async () => {
    const e = makeEnv();
    const a = await e.codesSvc.issue(null, '203.0.113.5', undefined, NOW);
    const r = await e.ticketsSvc.redeem(SERVER, body(a.code), NOW);
    expect(r).toMatchObject({ status: 'issued' });
    const { codes, tickets } = e.rows();
    expect(tickets).toHaveLength(1);
    expect(tickets[0]).toMatchObject({ playerUuid: U1, playerName: 'Steve' });
    expect(codes[0].redeemedAt).not.toBeNull();
    expect(codes[0].ticketId).toBe(tickets[0].id);
  });
  it('лимиты проверяются первыми по очереди (отказ UUID не расходует сервер)', async () => {
    const e = makeEnv();
    e.redis.hit.mockResolvedValueOnce(7);
    await expect(
      e.ticketsSvc.redeem(SERVER, body('x'), NOW),
    ).rejects.toMatchObject({ kind: 'rate_limited' });
    expect(e.db.giveawayTicket.findUnique).not.toHaveBeenCalled();
    expect(e.redis.hit.mock.calls.map((c) => c[0])).toEqual(['redeem-uuid']);
  });
  it('время меньше порога: not_enough, код не гасится, попытка запоминается', async () => {
    const e = makeEnv(100);
    const a = await e.codesSvc.issue(null, '203.0.113.5', undefined, NOW);
    e.db.giveawayCode.updateMany.mockClear();
    const r = await e.ticketsSvc.redeem(SERVER, body(a.code), NOW);
    expect(r).toEqual({
      status: 'not_enough',
      minutes: 100,
      remainingMinutes: 2900,
      thresholdMinutes: 3000,
    });
    expect(e.rows().codes[0].redeemedAt).toBeNull();
    expect(e.rows().codes[0]).toMatchObject({
      lastAttemptMinutes: 100,
      lastAttemptThreshold: 3000,
    });
    const st = await e.codesSvc.status(a.sessionToken, NOW);
    expect(st).toMatchObject({
      status: 'pending',
      lastAttempt: {
        result: 'not_enough',
        minutes: 100,
        remainingMinutes: 2900,
        thresholdMinutes: 3000,
      },
    });
    // Неверный код при нехватке времени даёт тот же not_enough (код не раскрывается).
    const r2 = await e.ticketsSvc.redeem(SERVER, body('garbage'), NOW);
    expect(r2.status).toBe('not_enough');
  });
  it('единый invalid_code для неверного формата, неизвестного, просроченного, погашенного, чужого', async () => {
    const e = makeEnv();
    const fresh = await e.codesSvc.issue(null, '203.0.113.5', undefined, NOW);
    const expired = await e.codesSvc.issue(null, '203.0.113.6', undefined, NOW);
    const used = await e.codesSvc.issue(null, '203.0.113.7', undefined, NOW);
    await e.ticketsSvc.redeem(SERVER, body(used.code, U2), NOW);
    const later = new Date(NOW.getTime() + 601_000);
    const cases = [
      await e.ticketsSvc.redeem(SERVER, body('not a code'), NOW),
      await e.ticketsSvc.redeem(SERVER, body(formatCode(generateCode())), NOW),
      await e.ticketsSvc.redeem(SERVER, body(expired.code), later),
      await e.ticketsSvc.redeem(SERVER, body(used.code, U1), NOW),
    ];
    for (const c of cases) expect(c).toEqual({ status: 'invalid_code' });
    // свежий код остался нетронутым и годен для своего игрока
    const ok = await e.ticketsSvc.redeem(SERVER, body(fresh.code, U1), NOW);
    expect(ok.status).toBe('issued');
  });
  it('неверный формат хэшируется как фиксированная строка (одна ветвь работы)', async () => {
    const e = makeEnv();
    const spy = jest.spyOn(e.codesSvc, 'codeHash');
    await e.ticketsSvc.redeem(SERVER, body('???'), NOW);
    expect(spy).toHaveBeenCalledWith(DUMMY_CODE);
  });
  it('одноразовость под конкуренцией: два игрока, один код -> один билет', async () => {
    const e = makeEnv();
    const a = await e.codesSvc.issue(null, '203.0.113.5', undefined, NOW);
    const [r1, r2] = await Promise.all([
      e.ticketsSvc.redeem(SERVER, body(a.code, U1), NOW),
      e.ticketsSvc.redeem(SERVER, body(a.code, U2, 'Alex'), NOW),
    ]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual(['invalid_code', 'issued']);
    expect(e.rows().tickets).toHaveLength(1);
  });
  it('один билет на UUID: повтор возвращает тот же, новый код привязывается к нему', async () => {
    const e = makeEnv();
    const a = await e.codesSvc.issue(null, '203.0.113.5', undefined, NOW);
    const first = (await e.ticketsSvc.redeem(SERVER, body(a.code), NOW)) as {
      ticket: string;
    };
    const b = await e.codesSvc.issue(null, '203.0.113.9', undefined, NOW);
    const again = await e.ticketsSvc.redeem(SERVER, body(b.code), NOW);
    expect(again).toEqual({
      status: 'issued',
      ticket: first.ticket,
      repeat: true,
    });
    expect(e.rows().tickets).toHaveLength(1);
    // код b привязан к билету: страница b увидит его
    expect(await e.codesSvc.status(b.sessionToken, NOW)).toMatchObject({
      status: 'redeemed',
      ticket: first.ticket,
    });
    // порог для уже имеющего билет не проверяется
    expect(e.db.giveawayMinute.count).toHaveBeenCalledTimes(1);
  });
  it('повтор с невалидным кодом у игрока с билетом: тот же билет', async () => {
    const e = makeEnv();
    const a = await e.codesSvc.issue(null, '203.0.113.5', undefined, NOW);
    const first = (await e.ticketsSvc.redeem(SERVER, body(a.code), NOW)) as {
      ticket: string;
    };
    const r = await e.ticketsSvc.redeem(SERVER, body('zzz'), NOW);
    expect(r).toEqual({ status: 'issued', ticket: first.ticket, repeat: true });
  });
  it('окно выдачи: до старта и после отсечки', async () => {
    const e = makeEnv();
    const a = await e.codesSvc.issue(null, '203.0.113.5', undefined, NOW);
    expect(
      await e.ticketsSvc.redeem(
        SERVER,
        body(a.code),
        new Date('2026-11-21T20:00:00Z'),
      ),
    ).toEqual({ status: 'not_started' });
    expect(
      await e.ticketsSvc.redeem(
        SERVER,
        body(a.code),
        new Date('2026-12-30T21:00:00Z'),
      ),
    ).toEqual({ status: 'closed' });
  });
  it('коллизия билета: повтор с новым значением, код не теряется', async () => {
    const e = makeEnv();
    await e.db.giveawayTicket.create({
      data: {
        ticket: 'A000',
        playerUuid: U2,
        playerName: 'Bob',
        issuedAt: NOW,
      },
    });
    const spy = jest
      .spyOn(codesLib, 'generateTicket')
      .mockReturnValueOnce('A000')
      .mockReturnValueOnce('A000')
      .mockReturnValueOnce('B123');
    const a = await e.codesSvc.issue(null, '203.0.113.5', undefined, NOW);
    const r = await e.ticketsSvc.redeem(SERVER, body(a.code), NOW);
    spy.mockRestore();
    expect(r).toEqual({ status: 'issued', ticket: 'B123' });
    expect(e.rows().codes[0].redeemedAt).not.toBeNull();
  });
  it('постоянные коллизии: 8 попыток, затем 503, код не погашен', async () => {
    const e = makeEnv();
    await e.db.giveawayTicket.create({
      data: {
        ticket: 'A000',
        playerUuid: U2,
        playerName: 'Bob',
        issuedAt: NOW,
      },
    });
    const spy = jest.spyOn(codesLib, 'generateTicket').mockReturnValue('A000');
    const a = await e.codesSvc.issue(null, '203.0.113.5', undefined, NOW);
    const err = await e.ticketsSvc
      .redeem(SERVER, body(a.code), NOW)
      .catch((x: unknown) => x);
    expect(spy).toHaveBeenCalledTimes(8);
    spy.mockRestore();
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(503);
    expect(e.rows().codes[0].redeemedAt).toBeNull();
  });
  it('минуты считаются только с разрешённых серверов', async () => {
    const e = makeEnv();
    const a = await e.codesSvc.issue(null, '203.0.113.5', undefined, NOW);
    await e.ticketsSvc.redeem(SERVER, body(a.code), NOW);
    const where = e.minuteWhere[0] as {
      serverSlug: { in: string[] };
      playerUuid: string;
    };
    expect(where.serverSlug).toEqual({ in: [SERVER] });
    expect(where.playerUuid).toBe(U1);
  });
});

describe('giveaway фаза 2: прогресс и тела', () => {
  it('прогресс: проценты, остаток, флаг, билет', async () => {
    const e = makeEnv(1500);
    const r = await e.ticketsSvc.progress([U1, U2]);
    expect(r.thresholdMinutes).toBe(3000);
    expect(r.startAt).toBe('2026-11-21T21:00:00.000Z');
    expect(r.cutoffAt).toBe('2026-12-30T20:59:59.000Z');
    expect(r.startText).toBe('22.11 00:00 по МСК');
    expect(r.cutoffText).toBe('30.12 23:59 по МСК');
    expect(r.players[0]).toEqual({
      playerUuid: U1,
      minutes: 1500,
      thresholdMinutes: 3000,
      remainingMinutes: 1500,
      percent: 50,
      qualified: false,
      ticket: null,
    });
    expect(r.players[1]).toMatchObject({
      minutes: 0,
      percent: 0,
      qualified: false,
    });
  });
  it('прогресс: процент не выше 100, qualified при пороге', async () => {
    const e = makeEnv(4000);
    const r = await e.ticketsSvc.progress([U1]);
    expect(r.players[0]).toMatchObject({
      percent: 100,
      remainingMinutes: 0,
      qualified: true,
    });
  });
  it('разбор тел: строгие поля, до 100 uuid', () => {
    expect(
      parseRedeemBody({ code: 'x', playerUuid: U1, playerName: 'A' }),
    ).not.toBeNull();
    expect(
      parseRedeemBody({ code: 'x', playerUuid: U1, playerName: 'A', z: 1 }),
    ).toBeNull();
    expect(
      parseRedeemBody({ code: 'x', playerUuid: 'bad', playerName: 'A' }),
    ).toBeNull();
    expect(parseProgressBody({ uuids: [U1, U1.toUpperCase()] })).toEqual([U1]);
    expect(parseProgressBody({ uuids: [] })).toBeNull();
    expect(parseProgressBody({ uuids: Array(101).fill(U1) })).toBeNull();
  });
  it('подписываемые пути: канонический путь с /api', () => {
    expect(GIVEAWAY_SIGNED_PATHS['/giveaway/v1/redeem']).toBe(
      '/api/giveaway/v1/redeem',
    );
    expect(GIVEAWAY_SIGNED_PATHS['/api/giveaway/v1/progress']).toBe(
      '/api/giveaway/v1/progress',
    );
    expect(GIVEAWAY_SIGNED_PATHS['/giveaway/v1/events']).toBe(
      GIVEAWAY_SIGN_PATH,
    );
    expect(GIVEAWAY_SIGNED_PATHS['/api/giveaway/v1/codes']).toBeUndefined();
  });
});
