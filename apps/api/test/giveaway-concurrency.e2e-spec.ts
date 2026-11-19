import * as codesLib from '../src/modules/giveaway/giveaway-codes';
import { GiveawayCodesService } from '../src/modules/giveaway/giveaway-codes.service';
import { GiveawayTicketsService } from '../src/modules/giveaway/giveaway-tickets.service';
import {
  GiveawayConfig,
  readGiveawayConfig,
} from '../src/modules/giveaway/giveaway.config';
import { PrismaService } from '../src/modules/prisma/prisma.service';

jest.setTimeout(60_000);

/// Розыгрыш, фаза 2b (ADR-G002, M1/M2): конкурентные сценарии на настоящей БД.
///
/// СТАТИЧЕСКИЙ e2e: агентом НЕ запускался (решение владельца: проверка на VDS
/// после выкладки). Нужна ОДНОРАЗОВАЯ PostgreSQL с применёнными миграциями
/// (включая 20261119150000_giveaway_phase2b). Redis не нужен: лимиты заменены
/// заглушкой, сервисы собираются напрямую. Данные тестов привязаны к случайным
/// UUID/хэшам и удаляются в afterAll.
const SERVER = 'e2e-anarchy';
const START = new Date('2026-01-01T00:00:00.000Z');
const CUTOFF = new Date('2099-01-01T00:00:00.000Z');
const THRESHOLD = 3;
const SECRET = 'e2e-master-secret-synthetic-0123456789-abcdef';

function uuid(): string {
  const h = (n: number) =>
    Array.from({ length: n }, () =>
      Math.floor(Math.random() * 16).toString(16),
    ).join('');
  return `${h(8)}-${h(4)}-4${h(3)}-8${h(3)}-${h(12)}`;
}

describe('Giveaway: конкурентность кодов и билетов (e2e)', () => {
  let prisma: PrismaService;
  let codes: GiveawayCodesService;
  let tickets: GiveawayTicketsService;
  const players: string[] = [];
  const sessions: string[] = [];

  async function seedPlayer(): Promise<string> {
    const u = uuid();
    players.push(u);
    const base = Math.floor((Date.now() - 10 * 60_000) / 60_000) * 60_000;
    await prisma.giveawayMinute.createMany({
      data: Array.from({ length: THRESHOLD }, (_, i) => ({
        playerUuid: u,
        minute: new Date(base + i * 60_000),
        serverSlug: SERVER,
      })),
    });
    return u;
  }

  async function newCode(): Promise<{ code: string; token: string }> {
    const r = await codes.issue(null, '203.0.113.7', undefined);
    sessions.push(codes.sessionHash(r.sessionToken));
    return { code: r.code, token: r.sessionToken };
  }

  const redeem = (playerUuid: string, code: string) =>
    tickets.redeem(
      SERVER,
      { playerUuid, playerName: 'E2eP', code } as never,
      new Date(),
    );

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const redis = {
      hit: () => Promise.resolve(0),
      acquireLock: () => Promise.resolve(true),
      releaseLock: () => Promise.resolve(),
    };
    const settings = {
      get: () =>
        Promise.resolve({
          thresholdMinutes: THRESHOLD,
          startAt: START,
          cutoffAt: CUTOFF,
          timezone: 'Europe/Moscow',
          allowedServers: [SERVER],
        }),
      describe: () => ({}),
    };
    const config: GiveawayConfig = {
      ...readGiveawayConfig({ get: () => undefined as never }),
      enabled: true,
      masterSecret: Buffer.from(SECRET),
    };
    codes = new GiveawayCodesService(
      prisma,
      redis as never,
      settings as never,
      config,
    );
    tickets = new GiveawayTicketsService(
      prisma,
      redis as never,
      settings as never,
      codes,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.giveawayCode.deleteMany({
      where: { sessionHash: { in: sessions } },
    });
    await prisma.giveawayTicket.deleteMany({
      where: { playerUuid: { in: players } },
    });
    await prisma.giveawayMinute.deleteMany({
      where: { playerUuid: { in: players } },
    });
    await prisma.$disconnect();
  });

  it('один код с двух UUID одновременно: ровно один issued', async () => {
    const a = await seedPlayer();
    const b = await seedPlayer();
    const { code } = await newCode();
    const results = await Promise.all([redeem(a, code), redeem(b, code)]);
    expect(results.filter((r) => r.status === 'issued')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'invalid_code')).toHaveLength(1);
    const count = await prisma.giveawayTicket.count({
      where: { playerUuid: { in: [a, b] } },
    });
    expect(count).toBe(1);
  });

  it('два кода одного UUID одновременно: один билет', async () => {
    const u = await seedPlayer();
    const c1 = await newCode();
    const c2 = await newCode();
    const results = await Promise.all([redeem(u, c1.code), redeem(u, c2.code)]);
    expect(results.every((r) => r.status === 'issued')).toBe(true);
    const values = new Set(
      results.map((r) => (r.status === 'issued' ? r.ticket : '')),
    );
    expect(values.size).toBe(1);
    const count = await prisma.giveawayTicket.count({
      where: { playerUuid: u },
    });
    expect(count).toBe(1);
  });

  it('коллизия значения билета: повторная генерация', async () => {
    const a = await seedPlayer();
    const b = await seedPlayer();
    const c1 = await newCode();
    const c2 = await newCode();
    const fixed = `Z${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
    const spy = jest
      .spyOn(codesLib, 'generateTicket')
      .mockReturnValueOnce(fixed)
      .mockReturnValueOnce(fixed);
    const first = await redeem(a, c1.code);
    expect(first).toMatchObject({ status: 'issued', ticket: fixed });
    const second = await redeem(b, c2.code);
    expect(second.status).toBe('issued');
    if (second.status === 'issued') expect(second.ticket).not.toBe(fixed);
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(3);
    // Неудавшаяся попытка откатила погашение: нет кода без билета.
    const orphan = await prisma.giveawayCode.count({
      where: {
        redeemedAt: { not: null },
        ticketId: null,
        sessionHash: { in: sessions },
      },
    });
    expect(orphan).toBe(0);
  });

  it('частичный индекс: второй активный код сессии отклоняется БД', async () => {
    const { token } = await newCode();
    const sHash = codes.sessionHash(token);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60_000);
    await expect(
      prisma.giveawayCode.create({
        data: {
          codeHash: `e2e-dup-${uuid()}`,
          sessionHash: sHash,
          createdAt: now,
          expiresAt,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    // Аннулированный код индексом не ограничивается.
    await expect(
      prisma.giveawayCode.create({
        data: {
          codeHash: `e2e-rev-${uuid()}`,
          sessionHash: sHash,
          createdAt: now,
          expiresAt,
          revokedAt: now,
        },
      }),
    ).resolves.toBeDefined();
  });

  it('нехватка времени: код жив, lastAttempt виден в статусе', async () => {
    const u = uuid();
    players.push(u);
    const { code, token } = await newCode();
    const r = await redeem(u, code);
    expect(r.status).toBe('not_enough');
    const st = await codes.status(token);
    expect(st).toMatchObject({
      status: 'pending',
      lastAttempt: {
        result: 'not_enough',
        minutes: 0,
        remainingMinutes: THRESHOLD,
        thresholdMinutes: THRESHOLD,
      },
    });
  });
});
