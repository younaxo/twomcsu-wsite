import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  APPLY_TX_MAX_WAIT_MS,
  APPLY_TX_TIMEOUT_MS,
  chunk,
  EMPTY_SYNC_STATE,
  MirrorChange,
  PunishmentMirrorStore,
  SyncStatePatch,
  SQL_ID_CHUNK,
  SyncStateSnapshot,
} from './punishment-mirror.store';
import {
  NormalizedPunishment,
  PunishmentActor,
  PunishmentKind,
  PunishmentStatus,
} from './punishment.types';

/// Область источника в ключе зеркала (раздел 7): для единственного
/// писателя — константа.
export const SOURCE_SCOPE = 'default';

/// Время передаётся строкой ISO и приводится к `timestamp(3)`: столбцы
/// `TIMESTAMP(3)` без часового пояса хранят UTC, зона из строки отбрасывается.
function ts(date: Date): Prisma.Sql {
  return Prisma.sql`${date.toISOString()}::timestamp(3)`;
}

function tsOrNull(date: Date | null): Prisma.Sql {
  return date === null ? Prisma.sql`NULL` : ts(date);
}

function actorColumns(actor: PunishmentActor | null): {
  uuid: string | null;
  name: string | null;
  isConsole: boolean;
} {
  if (actor === null) return { uuid: null, name: null, isConsole: false };
  if (actor.console === true) {
    return { uuid: null, name: null, isConsole: true };
  }
  return { uuid: actor.uuid, name: actor.name, isConsole: false };
}

function validDate(date: Date | null | undefined): boolean {
  return date === null || date === undefined || !Number.isNaN(date.getTime());
}

/// Строка пригодна к записи: все даты корректны (`toISOString` на Invalid
/// Date бросает RangeError, и это не должно случиться внутри транзакции).
function hasValidDates(row: NormalizedPunishment): boolean {
  return (
    validDate(row.startedAt) &&
    validDate(row.until) &&
    validDate(row.removal?.at ?? null)
  );
}

interface ChangeRow {
  kind: PunishmentKind;
  sourceId: bigint;
  rev: number;
  status: PunishmentStatus;
}

/// Боевая реализация хранилища на Prisma. Запись зеркала — сырой SQL
/// `INSERT ... ON CONFLICT DO UPDATE ... WHERE rowHash <> EXCLUDED.rowHash`
/// (раздел 7 дизайна): одна команда на строку, `xmax = 0` отличает вставку
/// от обновления. Все значения передаются параметрами; динамического SQL нет.
@Injectable()
export class PrismaPunishmentMirrorStore implements PunishmentMirrorStore {
  private readonly logger = new Logger(PrismaPunishmentMirrorStore.name);

  constructor(private readonly prisma: PrismaService) {}

  async getState(
    source: string,
    kind: PunishmentKind,
  ): Promise<SyncStateSnapshot> {
    const row = await this.prisma.punishmentSyncState.findUnique({
      where: { source_kind: { source, kind } },
    });
    if (!row) return { ...EMPTY_SYNC_STATE };
    return {
      cursorId: row.cursorId,
      lastPollAt: row.lastPollAt,
      lastSuccessAt: row.lastSuccessAt,
      lastActiveCheckAt: row.lastActiveCheckAt,
      lastFullReconcileAt: row.lastFullReconcileAt,
      consecutiveFailures: row.consecutiveFailures,
      lastErrorCode: row.lastErrorCode,
      initialSyncDoneAt: row.initialSyncDoneAt,
    };
  }

  async patchState(
    source: string,
    kind: PunishmentKind,
    patch: SyncStatePatch,
  ): Promise<void> {
    await this.prisma.punishmentSyncState.upsert({
      where: { source_kind: { source, kind } },
      create: { source, kind, ...patch },
      update: patch,
    });
  }

  async applyBatch(
    source: string,
    kind: PunishmentKind,
    rows: NormalizedPunishment[],
    cursorId: bigint | null,
    now: Date,
  ): Promise<MirrorChange[]> {
    // Проверки ДО транзакции: Invalid Date не должен ронять её посередине.
    if (!validDate(now) || now === null) {
      throw new RangeError('Некорректное время записи зеркала');
    }
    const valid = rows.filter(hasValidDates);
    if (valid.length !== rows.length) {
      this.logger.warn(
        `Пропущено строк с некорректной датой: ${rows.length - valid.length}`,
      );
    }
    return this.prisma.$transaction(
      async (tx) => {
        const changes: MirrorChange[] = [];
        for (const row of valid) {
          const result = await tx.$queryRaw<
            Array<{ inserted: boolean; rev: number }>
          >(this.upsertSql(source, row, now));
          if (result.length > 0) {
            changes.push({
              kind: row.kind,
              sourceId: row.sourceId,
              inserted: result[0].inserted,
              rev: result[0].rev,
              status: row.status,
            });
          }
        }
        if (cursorId !== null) {
          await tx.$executeRaw`
          INSERT INTO "punishment_sync_state" ("id", "source", "kind", "cursorId")
          VALUES (${randomUUID()}, ${source}, ${kind}::"MinecraftPunishmentKind", ${cursorId})
          ON CONFLICT ("source", "kind") DO UPDATE
          SET "cursorId" = GREATEST("punishment_sync_state"."cursorId", EXCLUDED."cursorId")`;
        }
        return changes;
      },
      { maxWait: APPLY_TX_MAX_WAIT_MS, timeout: APPLY_TX_TIMEOUT_MS },
    );
  }

  async setCursor(
    source: string,
    kind: PunishmentKind,
    cursorId: bigint,
  ): Promise<void> {
    await this.prisma.punishmentSyncState.upsert({
      where: { source_kind: { source, kind } },
      create: { source, kind, cursorId },
      update: { cursorId },
    });
  }

  private upsertSql(
    source: string,
    row: NormalizedPunishment,
    now: Date,
  ): Prisma.Sql {
    const executor = actorColumns(row.executor);
    const removedBy = actorColumns(row.removal?.by ?? null);
    return Prisma.sql`
      INSERT INTO "minecraft_punishments" (
        "id", "source", "sourceScope", "kind", "sourceId", "subjectUuid",
        "subjectName", "ipBan", "reason", "executorUuid", "executorName",
        "executorIsConsole", "removedByUuid", "removedByName",
        "removedByIsConsole", "removedReason", "removedAt", "startedAt",
        "until", "status", "serverScope", "serverOrigin", "silent",
        "template", "rowHash", "rev", "firstSeenAt", "lastSeenAt",
        "lastChangedAt"
      ) VALUES (
        ${randomUUID()}, ${source}, ${SOURCE_SCOPE},
        ${row.kind}::"MinecraftPunishmentKind", ${BigInt(row.sourceId)},
        ${row.subjectUuid}, ${row.subjectName}, ${row.ipBan}, ${row.reason},
        ${executor.uuid}, ${executor.name}, ${executor.isConsole},
        ${removedBy.uuid}, ${removedBy.name}, ${removedBy.isConsole},
        ${row.removal?.reason ?? null}, ${tsOrNull(row.removal?.at ?? null)},
        ${ts(row.startedAt)}, ${tsOrNull(row.until)},
        ${row.status}::"MinecraftPunishmentStatus", ${row.scope},
        ${row.origin}, ${row.silent}, ${row.template}, ${row.rowHash}, 1,
        ${ts(now)}, ${ts(now)}, ${ts(now)}
      )
      ON CONFLICT ("source", "sourceScope", "kind", "sourceId") DO UPDATE SET
        "subjectUuid" = EXCLUDED."subjectUuid",
        "subjectName" = EXCLUDED."subjectName",
        "ipBan" = EXCLUDED."ipBan",
        "reason" = EXCLUDED."reason",
        "executorUuid" = EXCLUDED."executorUuid",
        "executorName" = EXCLUDED."executorName",
        "executorIsConsole" = EXCLUDED."executorIsConsole",
        "removedByUuid" = EXCLUDED."removedByUuid",
        "removedByName" = EXCLUDED."removedByName",
        "removedByIsConsole" = EXCLUDED."removedByIsConsole",
        "removedReason" = EXCLUDED."removedReason",
        "removedAt" = EXCLUDED."removedAt",
        "startedAt" = EXCLUDED."startedAt",
        "until" = EXCLUDED."until",
        "status" = EXCLUDED."status",
        "serverScope" = EXCLUDED."serverScope",
        "serverOrigin" = EXCLUDED."serverOrigin",
        "silent" = EXCLUDED."silent",
        "template" = EXCLUDED."template",
        "rowHash" = EXCLUDED."rowHash",
        "rev" = "minecraft_punishments"."rev" + 1,
        "lastSeenAt" = EXCLUDED."lastSeenAt",
        "lastChangedAt" = EXCLUDED."lastChangedAt",
        "deletedAtSource" = NULL
      WHERE "minecraft_punishments"."rowHash" <> EXCLUDED."rowHash"
         OR "minecraft_punishments"."status" = 'DELETED_AT_SOURCE'
      RETURNING (xmax = 0) AS "inserted", "rev"`;
  }

  async listActiveIds(
    source: string,
    kind: PunishmentKind,
    afterId: bigint,
    limit: number,
  ): Promise<bigint[]> {
    const rows = await this.prisma.minecraftPunishment.findMany({
      where: {
        source,
        sourceScope: SOURCE_SCOPE,
        kind,
        status: 'ACTIVE',
        sourceId: { gt: afterId },
      },
      orderBy: { sourceId: 'asc' },
      take: limit,
      select: { sourceId: true },
    });
    return rows.map((r) => r.sourceId);
  }

  async listMirroredIds(
    source: string,
    kind: PunishmentKind,
    afterId: bigint,
    upToId: bigint | null,
  ): Promise<bigint[]> {
    const rows = await this.prisma.minecraftPunishment.findMany({
      where: {
        source,
        sourceScope: SOURCE_SCOPE,
        kind,
        status: { not: 'DELETED_AT_SOURCE' },
        sourceId:
          upToId === null ? { gt: afterId } : { gt: afterId, lte: upToId },
      },
      orderBy: { sourceId: 'asc' },
      select: { sourceId: true },
    });
    return rows.map((r) => r.sourceId);
  }

  async listExpiredWithFutureUntil(
    source: string,
    kind: PunishmentKind,
    now: Date,
    limit: number,
  ): Promise<bigint[]> {
    const rows = await this.prisma.minecraftPunishment.findMany({
      where: {
        source,
        sourceScope: SOURCE_SCOPE,
        kind,
        status: 'EXPIRED',
        until: { gt: now },
      },
      orderBy: { sourceId: 'asc' },
      take: limit,
      select: { sourceId: true },
    });
    return rows.map((r) => r.sourceId);
  }

  async reactivate(
    source: string,
    kind: PunishmentKind,
    ids: bigint[],
    now: Date,
  ): Promise<MirrorChange[]> {
    if (ids.length === 0) return [];
    const out: MirrorChange[] = [];
    // Группы по SQL_ID_CHUNK id: лимит параметров запроса PostgreSQL.
    for (const part of chunk(ids, SQL_ID_CHUNK)) {
      const rows = await this.prisma.$queryRaw<ChangeRow[]>(Prisma.sql`
        UPDATE "minecraft_punishments"
        SET "status" = 'ACTIVE', "rev" = "rev" + 1, "lastChangedAt" = ${ts(now)}
        WHERE "source" = ${source} AND "sourceScope" = ${SOURCE_SCOPE}
          AND "kind" = ${kind}::"MinecraftPunishmentKind"
          AND "sourceId" IN (${Prisma.join(part)})
          AND "status" = 'EXPIRED'
        RETURNING "kind", "sourceId", "rev", "status"`);
      out.push(...rows.map(toChange));
    }
    return out;
  }

  async markDeletedAtSource(
    source: string,
    kind: PunishmentKind,
    ids: bigint[],
    now: Date,
  ): Promise<MirrorChange[]> {
    if (ids.length === 0) return [];
    const out: MirrorChange[] = [];
    // Группы по SQL_ID_CHUNK id: при частичном откате источника пропавших
    // строк может быть десятки тысяч, а лимит параметров PostgreSQL — 32767.
    for (const part of chunk(ids, SQL_ID_CHUNK)) {
      const rows = await this.prisma.$queryRaw<ChangeRow[]>(Prisma.sql`
        UPDATE "minecraft_punishments"
        SET "status" = 'DELETED_AT_SOURCE', "deletedAtSource" = ${ts(now)},
            "rev" = "rev" + 1, "lastChangedAt" = ${ts(now)}
        WHERE "source" = ${source} AND "sourceScope" = ${SOURCE_SCOPE}
          AND "kind" = ${kind}::"MinecraftPunishmentKind"
          AND "sourceId" IN (${Prisma.join(part)})
          AND "status" <> 'DELETED_AT_SOURCE'
        RETURNING "kind", "sourceId", "rev", "status"`);
      out.push(...rows.map(toChange));
    }
    return out;
  }

  async expireDue(source: string, now: Date): Promise<MirrorChange[]> {
    const rows = await this.prisma.$queryRaw<ChangeRow[]>(Prisma.sql`
      UPDATE "minecraft_punishments"
      SET "status" = 'EXPIRED', "rev" = "rev" + 1, "lastChangedAt" = ${ts(now)}
      WHERE "source" = ${source} AND "sourceScope" = ${SOURCE_SCOPE}
        AND "status" = 'ACTIVE' AND "until" IS NOT NULL AND "until" <= ${ts(now)}
      RETURNING "kind", "sourceId", "rev", "status"`);
    return rows.map(toChange);
  }
}

function toChange(row: ChangeRow): MirrorChange {
  return {
    kind: row.kind,
    sourceId: row.sourceId.toString(),
    inserted: false,
    rev: row.rev,
    status: row.status,
  };
}
