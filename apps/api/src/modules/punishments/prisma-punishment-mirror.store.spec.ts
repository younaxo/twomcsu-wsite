import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  APPLY_TX_MAX_WAIT_MS,
  APPLY_TX_TIMEOUT_MS,
  chunk,
  SQL_ID_CHUNK,
} from './punishment-mirror.store';
import { PrismaPunishmentMirrorStore } from './prisma-punishment-mirror.store';
import { NormalizedPunishment } from './punishment.types';

/// Prisma-заглушка: записывает число параметров каждого SQL-запроса и
/// параметры транзакции. БД не используется.
function fakePrisma() {
  const paramCounts: number[] = [];
  const txOptions: unknown[] = [];
  let txStarted = 0;
  const db = {
    $queryRaw: async (sql: Prisma.Sql) => {
      paramCounts.push(sql.values.length);
      return [];
    },
    $executeRaw: async () => 0,
    $transaction: async (
      fn: (tx: unknown) => Promise<unknown>,
      options: unknown,
    ) => {
      txStarted += 1;
      txOptions.push(options);
      return fn(db);
    },
  };
  return {
    db,
    paramCounts,
    txOptions,
    get txStarted() {
      return txStarted;
    },
  };
}

function row(
  id: number,
  overrides: Partial<NormalizedPunishment> = {},
): NormalizedPunishment {
  return {
    kind: 'BAN',
    sourceId: String(id),
    subjectUuid: null,
    subjectName: 'p',
    ipBan: false,
    reason: null,
    executor: null,
    startedAt: new Date(1_800_000_000_000),
    until: null,
    status: 'ACTIVE',
    removal: null,
    scope: null,
    origin: null,
    silent: false,
    template: null,
    sourceActive: true,
    rowHash: `h${id}`,
    ...overrides,
  };
}

function storeWith(fake: ReturnType<typeof fakePrisma>) {
  return new PrismaPunishmentMirrorStore(fake.db as unknown as PrismaService);
}

describe('chunk', () => {
  it('делит на группы заданного размера', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });
});

describe('PrismaPunishmentMirrorStore: пометка удалений группами (F2)', () => {
  it('25000 id не уходят одним запросом: каждая группа не больше лимита', async () => {
    const fake = fakePrisma();
    const ids = Array.from({ length: 25_000 }, (_, i) => BigInt(i + 1));
    await storeWith(fake).markDeletedAtSource(
      'litebans',
      'BAN',
      ids,
      new Date(),
    );
    expect(fake.paramCounts).toHaveLength(25);
    // Параметры: source, scope, kind, now x2 и id группы.
    for (const count of fake.paramCounts) {
      expect(count).toBeLessThanOrEqual(SQL_ID_CHUNK + 10);
    }
    expect(Math.max(...fake.paramCounts)).toBeLessThan(32_767);
  });

  it('reactivate тоже идёт группами', async () => {
    const fake = fakePrisma();
    const ids = Array.from({ length: 2500 }, (_, i) => BigInt(i + 1));
    await storeWith(fake).reactivate('litebans', 'BAN', ids, new Date());
    expect(fake.paramCounts).toHaveLength(3);
  });

  it('пустой список не делает запросов', async () => {
    const fake = fakePrisma();
    expect(
      await storeWith(fake).markDeletedAtSource('s', 'BAN', [], new Date()),
    ).toEqual([]);
    expect(fake.paramCounts).toHaveLength(0);
  });
});

describe('PrismaPunishmentMirrorStore.applyBatch', () => {
  it('транзакция с явными maxWait и timeout (F4)', async () => {
    const fake = fakePrisma();
    await storeWith(fake).applyBatch('s', 'BAN', [row(1)], 1n, new Date());
    expect(fake.txOptions).toEqual([
      { maxWait: APPLY_TX_MAX_WAIT_MS, timeout: APPLY_TX_TIMEOUT_MS },
    ]);
  });

  it('Invalid Date проверяется до транзакции: строка пропускается, остальные пишутся (F10)', async () => {
    const fake = fakePrisma();
    const bad = row(1, { startedAt: new Date(Number.NaN) });
    const badUntil = row(2, { until: new Date(Number.NaN) });
    const good = row(3);
    await storeWith(fake).applyBatch(
      's',
      'BAN',
      [bad, badUntil, good],
      3n,
      new Date(),
    );
    expect(fake.paramCounts).toHaveLength(1);
  });

  it('Invalid Date во времени записи отвергается до транзакции', async () => {
    const fake = fakePrisma();
    await expect(
      storeWith(fake).applyBatch(
        's',
        'BAN',
        [row(1)],
        1n,
        new Date(Number.NaN),
      ),
    ).rejects.toBeInstanceOf(RangeError);
    expect(fake.txStarted).toBe(0);
  });
});
