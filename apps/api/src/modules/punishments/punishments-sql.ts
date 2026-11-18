import { Prisma } from '@prisma/client';
import { PunishmentOrder } from './api/punishments-api.types';
import { CursorPosition } from './punishments-cursor';
import { REDACTED } from './text-sanitizer';

/// Построитель запросов списка зеркала (контракт 2.1, 2.2). Значения идут
/// ТОЛЬКО параметрами `Prisma.sql`; в текст запроса попадают лишь
/// константные фрагменты кода. Фильтрация в приложении после выборки не
/// допускается (ломает курсор и размер страницы).

type Kind = 'BAN' | 'MUTE' | 'WARN' | 'KICK';
type StaffStatus = 'ACTIVE' | 'EXPIRED' | 'REMOVED' | 'DELETED_AT_SOURCE';

export interface ListFilters {
  kinds?: readonly Kind[];
  /// Публичный и «мой» разрез: активные или завершённые (с поправкой на `until`).
  activity?: 'active' | 'ended';
  /// Служебный разрез: набор статусов (с поправкой на `until`).
  statuses?: readonly StaffStatus[];
  namePrefix?: string;
  nameExact?: string;
  subjectUuid?: string;
  silent?: boolean;
  ipBan?: boolean;
  hidden?: boolean;
  from?: Date;
  to?: Date;
}

export interface ListQuerySpec {
  filters: ListFilters;
  /// Предикат публичности (2.2); у «моих» и служебного списков не применяется.
  publicOnly: boolean;
  /// `punishments.public.hideSilent` (по умолчанию true).
  hideSilent: boolean;
  /// Только для «моих»: свой uuid; DELETED_AT_SOURCE скрыт.
  mineUuid?: string;
  /// Служебный список видит всё, в том числе DELETED_AT_SOURCE.
  order: PunishmentOrder;
  limit: number;
  cursor: CursorPosition | null;
  now: Date;
}

/// Экранирование значения для `LIKE ... ESCAPE '\'`: `\`, `%`, `_` буквально.
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

const PUBLIC_NAME_PATTERN = '^[A-Za-z0-9_.]{1,16}$';

const activeExpr = (now: Date): Prisma.Sql =>
  Prisma.sql`("status" = 'ACTIVE' AND ("until" IS NULL OR "until" > ${now}))`;

function statusExpr(status: StaffStatus, now: Date): Prisma.Sql {
  switch (status) {
    case 'ACTIVE':
      return activeExpr(now);
    case 'EXPIRED':
      return Prisma.sql`("status" = 'EXPIRED' OR ("status" = 'ACTIVE' AND "until" IS NOT NULL AND "until" <= ${now}))`;
    case 'REMOVED':
      return Prisma.sql`"status" = 'REMOVED'`;
    case 'DELETED_AT_SOURCE':
      return Prisma.sql`"status" = 'DELETED_AT_SOURCE'`;
  }
}

export function buildConditions(spec: ListQuerySpec): Prisma.Sql[] {
  const { filters: f, now } = spec;
  const where: Prisma.Sql[] = [
    // LiteBans (область default) плюс события Bridge от серверов, которым
    // владелец включил punishments-authoritative (контракт 2.4). Подзапрос по
    // маленькой таблице bridge_servers; без таких серверов выборка прежняя.
    Prisma.sql`(("source" = 'litebans' AND "sourceScope" = 'default') OR ("source" = 'bridge' AND "sourceScope" IN (SELECT "sourceScope" FROM "bridge_servers" WHERE "status" = 'ACTIVE' AND "capabilities" @> '{"punishments-authoritative": true}'::jsonb)))`,
  ];

  if (spec.publicOnly) {
    // Единая функция предиката публичности (2.2); частичный индекс
    // повторяет её константную часть дословно.
    where.push(Prisma.sql`"kind" IN ('BAN', 'MUTE')`);
    where.push(Prisma.sql`"isHidden" = false`);
    if (spec.hideSilent) where.push(Prisma.sql`"silent" = false`);
    where.push(Prisma.sql`"ipBan" = false`);
    where.push(Prisma.sql`"status" <> 'DELETED_AT_SOURCE'`);
    where.push(Prisma.sql`"subjectName" ~ ${PUBLIC_NAME_PATTERN}`);
    where.push(Prisma.sql`strpos("subjectName", ${REDACTED}) = 0`);
  }

  if (spec.mineUuid !== undefined) {
    where.push(Prisma.sql`"subjectUuid" = ${spec.mineUuid}`);
    where.push(Prisma.sql`"status" <> 'DELETED_AT_SOURCE'`);
  }

  if (f.kinds && f.kinds.length > 0) {
    where.push(
      Prisma.sql`"kind" IN (${Prisma.join(
        f.kinds.map((k) => Prisma.sql`${k}::"MinecraftPunishmentKind"`),
      )})`,
    );
  }

  if (f.activity === 'active') where.push(activeExpr(now));
  if (f.activity === 'ended') {
    where.push(Prisma.sql`NOT ${activeExpr(now)}`);
  }

  if (f.statuses && f.statuses.length > 0) {
    where.push(
      Prisma.sql`(${Prisma.join(
        f.statuses.map((s) => statusExpr(s, now)),
        ' OR ',
      )})`,
    );
  }

  if (f.namePrefix !== undefined) {
    // Индекс lower("subjectName") text_pattern_ops; значение экранировано и
    // идёт параметром вместе с завершающим `%`.
    where.push(
      Prisma.sql`lower("subjectName") LIKE ${`${escapeLike(f.namePrefix.toLowerCase())}%`} ESCAPE '\\'`,
    );
  }
  if (f.nameExact !== undefined) {
    where.push(Prisma.sql`lower("subjectName") = ${f.nameExact.toLowerCase()}`);
  }
  if (f.subjectUuid !== undefined) {
    where.push(Prisma.sql`"subjectUuid" = ${f.subjectUuid.toLowerCase()}`);
  }
  if (f.silent !== undefined) where.push(Prisma.sql`"silent" = ${f.silent}`);
  if (f.ipBan !== undefined) where.push(Prisma.sql`"ipBan" = ${f.ipBan}`);
  if (f.hidden !== undefined) where.push(Prisma.sql`"isHidden" = ${f.hidden}`);
  if (f.from !== undefined) where.push(Prisma.sql`"startedAt" >= ${f.from}`);
  if (f.to !== undefined) where.push(Prisma.sql`"startedAt" <= ${f.to}`);

  if (spec.cursor) {
    // Направление одинаково для обеих колонок: сравнение строк.
    const at = new Date(spec.cursor.t);
    where.push(
      spec.order === 'desc'
        ? Prisma.sql`("startedAt", "id") < (${at}, ${spec.cursor.i})`
        : Prisma.sql`("startedAt", "id") > (${at}, ${spec.cursor.i})`,
    );
  }
  return where;
}

/// Полный запрос страницы: `limit + 1` строк, чтобы определить `nextCursor`.
export function buildListQuery(spec: ListQuerySpec): Prisma.Sql {
  const where = Prisma.join(buildConditions(spec), ' AND ');
  const direction = spec.order === 'desc' ? Prisma.sql`DESC` : Prisma.sql`ASC`;
  return Prisma.sql`SELECT * FROM "minecraft_punishments" WHERE ${where} ORDER BY "startedAt" ${direction}, "id" ${direction} LIMIT ${spec.limit + 1}`;
}

/// Нормализованный набор фильтров для хэша курсора (без cursor, limit, order).
export function filtersForHash(
  spec: Pick<ListQuerySpec, 'filters' | 'hideSilent'> & { mine?: boolean },
): Record<string, unknown> {
  const f = spec.filters;
  return {
    kinds: f.kinds ? [...f.kinds].sort() : null,
    activity: f.activity ?? null,
    statuses: f.statuses ? [...f.statuses].sort() : null,
    namePrefix: f.namePrefix?.toLowerCase() ?? null,
    nameExact: f.nameExact?.toLowerCase() ?? null,
    subjectUuid: f.subjectUuid?.toLowerCase() ?? null,
    silent: f.silent ?? null,
    ipBan: f.ipBan ?? null,
    hidden: f.hidden ?? null,
    from: f.from?.toISOString() ?? null,
    to: f.to?.toISOString() ?? null,
    hideSilent: spec.hideSilent,
    mine: spec.mine ?? null,
  };
}
