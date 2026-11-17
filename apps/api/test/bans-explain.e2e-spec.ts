import { Prisma, PrismaClient } from '@prisma/client';
import {
  ListQuerySpec,
  buildConditions,
  buildListQuery,
} from '../src/modules/punishments/punishments-sql';

jest.setTimeout(120_000);

/// Срез 2, /bans (контракт 2.2, 2.6, тест-план п.20, п.38): EXPLAIN запросов
/// списка на реальном PostgreSQL с индексами миграции
/// 20261117040000_punishments_public_indexes.
///
/// СТАТИЧЕСКИЙ e2e: агентом НЕ запускался. ТОЛЬКО ОДНОРАЗОВАЯ ЛОКАЛЬНАЯ БД:
/// тест вставляет 20 000 строк в `minecraft_punishments` (id с префиксом
/// `e2e-explain-`, ник `xq#####`, sourceId от 8 000 000 000) и удаляет их в
/// afterAll. Поэтому запускается только при явном `BANS_EXPLAIN_E2E=1`; без
/// переменной набор пропущен. Никогда не запускать на общей dev-БД и production.
/// Подключение: DATABASE_URL окружения e2e; для защиты от случайной общей БД
/// имя базы должно содержать `test`, `e2e` или `scratch`.
const ENABLED = process.env.BANS_EXPLAIN_E2E === '1';
const suite = ENABLED ? describe : describe.skip;

const ID_PREFIX = 'e2e-explain-';
const ROWS = 20_000;
const NAME_IDX = 'minecraft_punishments_subjectName_lower_idx';
const PUBLIC_IDX = 'minecraft_punishments_public_startedAt_id_idx';
const SORT_IDX = 'minecraft_punishments_startedAt_id_idx';

suite('Bans: EXPLAIN индексов (e2e, одноразовая БД)', () => {
  let prisma: PrismaClient | undefined;

  const spec = (over: Partial<ListQuerySpec>): ListQuerySpec => ({
    filters: {},
    publicOnly: true,
    hideSilent: true,
    order: 'desc',
    limit: 25,
    cursor: null,
    now: new Date(),
    ...over,
  });

  /// План выполняется в одной транзакции (одно соединение), чтобы SET LOCAL
  /// действовал на EXPLAIN. Строки настроек - только константы теста.
  async function plan(
    sql: Prisma.Sql,
    settings: string[] = [],
  ): Promise<string> {
    return prisma!.$transaction(async (tx) => {
      for (const setting of settings) await tx.$executeRawUnsafe(setting);
      const rows = await tx.$queryRaw<unknown[]>(
        Prisma.sql`EXPLAIN (FORMAT JSON) ${sql}`,
      );
      return JSON.stringify(rows);
    });
  }

  const idsOf = (query: ListQuerySpec) =>
    Prisma.sql`SELECT "id" FROM "minecraft_punishments" WHERE ${Prisma.join(buildConditions(query), ' AND ')}`;

  beforeAll(async () => {
    const url = process.env.DATABASE_URL ?? '';
    const dbName = url.split('?')[0].split('/').pop() ?? '';
    if (!/test|e2e|scratch/i.test(dbName)) {
      throw new Error(
        `Имя БД "${dbName}" не похоже на одноразовую (нужно test, e2e или scratch): набор остановлен.`,
      );
    }
    prisma = new PrismaClient();
    await prisma.$connect();
    await prisma.$executeRaw`
      INSERT INTO "minecraft_punishments"
        ("id", "kind", "sourceId", "subjectName", "startedAt", "status", "rowHash")
      SELECT ${ID_PREFIX}::text || g::text,
             'BAN'::"MinecraftPunishmentKind",
             ${'8000000000'}::bigint + g,
             'xq' || lpad(g::text, 5, '0'),
             now() - make_interval(secs => g),
             'ACTIVE'::"MinecraftPunishmentStatus",
             'e2e'
      FROM generate_series(1, ${ROWS}::int) AS g`;
    await prisma.$executeRawUnsafe('ANALYZE "minecraft_punishments"');
  }, 120_000);

  afterAll(async () => {
    try {
      if (prisma) {
        await prisma.$executeRaw`DELETE FROM "minecraft_punishments" WHERE "id" LIKE ${`${ID_PREFIX}%`}`;
      }
    } finally {
      if (prisma) await prisma.$disconnect();
    }
  }, 60_000);

  it('литеральный префикс: индекс lower(subjectName) text_pattern_ops применим', async () => {
    const result = await plan(
      Prisma.sql`SELECT "id" FROM "minecraft_punishments" WHERE lower("subjectName") LIKE 'xq0012%' ESCAPE '\\'`,
      ['SET LOCAL enable_seqscan = off'],
    );
    expect(result).toContain(NAME_IDX);
  });

  it('параметризованный LIKE (как в сервисе), custom plan, без отключения seqscan: индекс по нику', async () => {
    const result = await plan(
      idsOf(spec({ filters: { namePrefix: 'xq0012' } })),
      ['SET LOCAL plan_cache_mode = force_custom_plan'],
    );
    expect(result).toContain(NAME_IDX);
  });

  it('параметризованный LIKE, force_generic_plan (контракт 2.2): индекс по нику', async () => {
    const result = await plan(
      idsOf(spec({ filters: { namePrefix: 'xq0012' } })),
      [
        'SET LOCAL plan_cache_mode = force_generic_plan',
        'SET LOCAL enable_seqscan = off',
      ],
    );
    // PostgreSQL не строит диапазон по text_pattern_ops для неизвестного
    // параметра generic plan, поэтому отказ здесь возможен: тогда нужна НОВАЯ
    // миграция/запрос по запасному варианту контракта 2.2 (диапазонное
    // сравнение lower("subjectName") >= $1 AND < $2), а не правка этой проверки.
    if (!result.includes(NAME_IDX)) {
      throw new Error(
        'generic plan не использует индекс по нику: применить запасной вариант контракта 2.2 (диапазон по lower-префиксу). План: ' +
          result,
      );
    }
  });

  it('публичный список: частичный индекс (startedAt, id) под сортировку', async () => {
    const result = await plan(buildListQuery(spec({})), [
      'SET LOCAL enable_seqscan = off',
    ]);
    expect(result).toContain(PUBLIC_IDX);
  });

  it('список персонала без публичного предиката: общий индекс (startedAt, id)', async () => {
    const result = await plan(
      buildListQuery(spec({ publicOnly: false, hideSilent: false })),
      ['SET LOCAL enable_seqscan = off'],
    );
    expect(result).toContain(SORT_IDX);
  });

  it('публичный список с реальным объёмом: не Seq Scan по всей таблице', async () => {
    const result = await plan(buildListQuery(spec({})));
    expect(result).not.toContain('"Node Type":"Seq Scan"');
  });
});
