import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { BridgeLogRetentionScheduler } from './bridge-log-retention.scheduler';
import { readBridgeLogRetention } from './bridge-log-retention';
import { deriveServerKey, verifySignature } from './bridge-crypto';
import {
  HEADER_KEY_ID,
  HEADER_NONCE,
  HEADER_SIGNATURE,
  HEADER_TIMESTAMP,
  PATH_EVENTS,
} from './bridge.constants';
import { parseEnvelope } from './bridge-schema';
import {
  parseRegisterArgs,
  registerServer,
} from '../../../scripts/bridge-register-server';
import { printKey } from '../../../scripts/bridge-print-key';
import {
  FAILURE_MODES,
  SimRequest,
  assertSimEnv,
  buildRequests,
  loadScenario,
} from '../../../scripts/bridge-plugin-sim';
import {
  TEST_MASTER,
  TEST_MASTER_SECRET,
} from '../../../test/support/bridge-support';

const FIX = join(__dirname, '../../../test/fixtures/bridge');
const env = (o: Record<string, string>) => ({
  get: <T = string>(k: string) => o[k] as unknown as T | undefined,
});

describe('retention config', () => {
  it('по умолчанию 7 суток', () => {
    expect(readBridgeLogRetention(env({})).retentionDays).toBe(7);
  });
  it('меньше 7 суток, ноль и не число - отказ', () => {
    for (const v of ['6', '0', 'abc', '7.5']) {
      expect(() =>
        readBridgeLogRetention(env({ BRIDGE_LOG_RETENTION_DAYS: v })),
      ).toThrow();
    }
  });
  it('10 суток допустимо, флаг выключает', () => {
    const c = readBridgeLogRetention(
      env({
        BRIDGE_LOG_RETENTION_DAYS: '10',
        BRIDGE_LOG_CLEANUP_ENABLED: 'false',
      }),
    );
    expect(c).toEqual({ retentionDays: 10, enabled: false });
  });
});

describe('BridgeLogRetentionScheduler', () => {
  const now = new Date('2026-11-17T12:00:00.000Z');
  const DAY = 86_400_000;
  function make(days: string | undefined, rows: Date[]) {
    const table = rows.map((d, i) => ({ id: `r${i}`, receivedAt: d }));
    const batches: number[] = [];
    const prisma = {
      bridgeEventLog: {
        findMany: jest.fn(
          ({
            where,
            take,
          }: {
            where: { receivedAt: { lt: Date } };
            take: number;
          }) =>
            Promise.resolve(
              table
                .filter((r) => r.receivedAt < where.receivedAt.lt)
                .slice(0, take)
                .map((r) => ({ id: r.id })),
            ),
        ),
        deleteMany: jest.fn(
          ({ where }: { where: { id: { in: string[] } } }) => {
            const ids = where.id.in;
            batches.push(ids.length);
            for (const id of ids) {
              table.splice(
                table.findIndex((r) => r.id === id),
                1,
              );
            }
            return Promise.resolve({ count: ids.length });
          },
        ),
        findFirst: jest.fn(() =>
          Promise.resolve(
            table.length
              ? table.reduce((a, b) => (a.receivedAt <= b.receivedAt ? a : b))
              : null,
          ),
        ),
      },
    };
    const cfg = {
      get: (k: string) =>
        k === 'BRIDGE_LOG_RETENTION_DAYS' ? days : undefined,
    };
    const s = new BridgeLogRetentionScheduler(prisma as never, cfg as never);
    return { s, batches };
  }

  it('удаляет только строки старше порога', async () => {
    const { s } = make('7', [
      new Date(now.getTime() - 8 * DAY),
      new Date(now.getTime() - 6 * DAY),
    ]);
    const r = await s.runOnce(now);
    expect(r.deleted).toBe(1);
    expect(r.oldestAgeDays).toBeCloseTo(6, 5);
  });

  it('удаляет пачками по 1000', async () => {
    const old = new Date(now.getTime() - 9 * DAY);
    const { s, batches } = make(
      '7',
      Array.from({ length: 2500 }, () => old),
    );
    const r = await s.runOnce(now);
    expect(r.deleted).toBe(2500);
    expect(batches).toEqual([1000, 1000, 500]);
    expect(r.oldestAgeDays).toBeNull();
  });

  it('конструктор отказывает при пороге меньше 7 суток', () => {
    expect(() => make('6', [])).toThrow();
  });

  it('метрика возраста самой старой строки', async () => {
    const { s } = make(undefined, [new Date(now.getTime() - 3 * DAY)]);
    await s.runOnce(now);
    expect(s.lastOldestAgeDays).toBeCloseTo(3, 5);
  });

  it('таймер в тестах не стартует', () => {
    const { s } = make('7', []);
    s.onModuleInit();
    expect((s as unknown as { timer: unknown }).timer).toBeNull();
  });
});

describe('bridge-register-server', () => {
  const create = jest.fn((a: { data: { slug: string } }) =>
    Promise.resolve({ slug: a.data.slug, keyGeneration: 1 }),
  );
  const db = (exists: boolean) =>
    ({
      bridgeServer: {
        findUnique: jest.fn(() => Promise.resolve(exists ? {} : null)),
        create,
      },
    }) as never;
  beforeEach(() => create.mockClear());

  it('NODE_ENV пустой, незаданный, production, staging - отказ', async () => {
    for (const e of [undefined, '', 'production', 'staging']) {
      await expect(
        registerServer(db(false), ['--slug', 'survival'], e),
      ).rejects.toThrow(/Отказ/);
    }
    expect(create).not.toHaveBeenCalled();
  });

  it('создаёт строку в development без мастер-секрета', async () => {
    const saved = process.env.BRIDGE_MASTER_SECRET;
    delete process.env.BRIDGE_MASTER_SECRET;
    const r = await registerServer(
      db(false),
      ['--slug', 'survival', '--name', 'Survival'],
      'development',
    );
    if (saved !== undefined) process.env.BRIDGE_MASTER_SECRET = saved;
    expect(r.slug).toBe('survival');
    expect(create.mock.calls[0][0].data).toMatchObject({
      capabilities: { punishments: true },
    });
  });

  it('неверный slug, дубликат и неизвестная возможность отклоняются', async () => {
    for (const s of ['A', 'a', 'bad.slug', '-x', 'x'.repeat(33)]) {
      expect(() => parseRegisterArgs(['--slug', s])).toThrow();
    }
    await expect(
      registerServer(db(true), ['--slug', 'survival'], 'test'),
    ).rejects.toThrow(/уже/);
    expect(() =>
      parseRegisterArgs(['--slug', 'survival', '--capabilities', 'root']),
    ).toThrow();
  });
});

describe('bridge-print-key', () => {
  const e = { BRIDGE_MASTER_SECRET: TEST_MASTER_SECRET };
  it('без --print-key отказ', () => {
    expect(() => printKey(['--slug', 'survival'], e)).toThrow(/--print-key/);
  });
  it('печатает ключ из общей деривации', () => {
    const r = printKey(
      ['--slug', 'survival', '--generation', '2', '--print-key'],
      e,
    );
    expect(r.keyId).toBe('survival.2');
    expect(r.keyHex).toBe(
      deriveServerKey(TEST_MASTER, 'survival', 2).toString('hex'),
    );
  });
  it('отсутствующий или короткий секрет - отказ', () => {
    const a = ['--slug', 'survival', '--print-key'];
    expect(() => printKey(a, {})).toThrow();
    expect(() => printKey(a, { BRIDGE_MASTER_SECRET: 'short' })).toThrow();
  });
});

describe('bridge-plugin-sim и fixtures', () => {
  const key = deriveServerKey(TEST_MASTER, 'survival', 1);
  const now = new Date('2026-11-17T12:00:00.000Z');
  const verify = (r: SimRequest) =>
    verifySignature(
      key,
      {
        keyId: r.headers[HEADER_KEY_ID],
        timestamp: r.headers[HEADER_TIMESTAMP],
        nonce: r.headers[HEADER_NONCE],
        method: 'POST',
        path: PATH_EVENTS,
        body: r.body,
      },
      r.headers[HEADER_SIGNATURE],
    );

  it('пустой, незаданный и production NODE_ENV - отказ', () => {
    for (const e of [undefined, '', 'production']) {
      expect(() => assertSimEnv(e)).toThrow();
    }
    expect(() => assertSimEnv('test')).not.toThrow();
    expect(() => assertSimEnv('development')).not.toThrow();
  });

  it('fixtures валидны, подпись верна, конверт проходит схему', () => {
    const files = readdirSync(FIX).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThanOrEqual(4);
    for (const f of files) {
      const sc = loadScenario(join(FIX, f));
      if (sc.modes) continue;
      const [req] = buildRequests(sc, { serverId: 'survival', key, now });
      expect(verify(req)).toBe(true);
      const parsed = parseEnvelope(JSON.parse(req.body.toString('utf8')));
      expect(parsed.ok).toBe(true);
    }
  });

  it('fixtures без секретов и IP-адресов', () => {
    for (const f of readdirSync(FIX)) {
      const t = readFileSync(join(FIX, f), 'utf8');
      expect(t).not.toMatch(/secret|\b\d{1,3}(\.\d{1,3}){3}\b/i);
    }
  });

  it('режимы отказов формируют ожидаемые аномалии', () => {
    const sc = loadScenario(join(FIX, 'failure-modes.json'));
    expect(sc.modes).toEqual([...FAILURE_MODES]);
    const build = (mode: (typeof FAILURE_MODES)[number]) =>
      buildRequests(sc, { serverId: 'survival', key, now, mode });
    const nowS = Math.floor(now.getTime() / 1000);
    expect(verify(build('bad-signature')[0])).toBe(false);
    expect(Number(build('stale-time')[0].headers[HEADER_TIMESTAMP])).toBe(
      nowS - 3600,
    );
    expect(Number(build('future-time')[0].headers[HEADER_TIMESTAMP])).toBe(
      nowS + 3600,
    );
    const rn = build('replay-nonce');
    expect(rn[0].headers[HEADER_NONCE]).toBe(rn[1].headers[HEADER_NONCE]);
    const rb = build('replay-batch');
    expect(rb[0].body.equals(rb[1].body)).toBe(true);
    expect(rb[0].headers[HEADER_NONCE]).not.toBe(rb[1].headers[HEADER_NONCE]);
    const ev = (m: (typeof FAILURE_MODES)[number]) =>
      (
        JSON.parse(build(m)[0].body.toString('utf8')) as {
          events: { seq: number; serverId: string; type: string }[];
        }
      ).events;
    expect(ev('reverse-order').map((x) => x.seq)).toEqual([2, 1]);
    expect(ev('seq-gap').map((x) => x.seq)).toEqual([1, 11]);
    expect(ev('batch-101')).toHaveLength(101);
    expect(ev('foreign-server')[0].serverId).toBe('other-server');
    expect(ev('future-type')[0].type).toBe('inventory.snapshot');
    expect(build('oversize')[0].body.length).toBeGreaterThan(262_144);
  });
});
