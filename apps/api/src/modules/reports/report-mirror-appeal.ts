import type { MinecraftPunishment, Prisma } from '@prisma/client';
import { refOf, viewStatus } from '../punishments/punishments-view';

/// Обжалование наказаний из зеркала LiteBans (срез l1-02, ADR-0194).

/// Повторное обжалование того же наказания после закрытия прежнего — не чаще.
export const REPORT_APPEAL_REPEAT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/// Поля наказания зеркала в обращении: без выдавшего, снявшего, причины,
/// uuid, IP-признака и служебных колонок. `subjectName` берёт только персонал.
export const APPEALED_MC_PUNISHMENT_SELECT = {
  id: true,
  kind: true,
  sourceId: true,
  status: true,
  startedAt: true,
  until: true,
  removedAt: true,
  subjectName: true,
} satisfies Prisma.MinecraftPunishmentSelect;

export type AppealedMirrorRow = Pick<
  MinecraftPunishment,
  | 'id'
  | 'kind'
  | 'sourceId'
  | 'status'
  | 'startedAt'
  | 'until'
  | 'removedAt'
  | 'subjectName'
>;

export interface AppealedMinecraftPunishmentView {
  ref: string;
  kind: AppealedMirrorRow['kind'];
  /** DELETED_AT_SOURCE наружу не выходит: отдаётся как REMOVED. */
  status: 'ACTIVE' | 'EXPIRED' | 'REMOVED';
  startedAt: string;
  until: string | null;
  removedAt: string | null;
  /** Только персоналу. */
  subjectName?: string | null;
}

/// BigInt (`sourceId`) в JSON не сериализуется, поэтому обращение отдаётся
/// с этим видом, а не со строкой БД.
export function toAppealedMirrorView(
  row: AppealedMirrorRow,
  nowMs: number,
  isStaff: boolean,
): AppealedMinecraftPunishmentView {
  const status = viewStatus(row, nowMs);
  return {
    ref: refOf(row),
    kind: row.kind,
    status: status === 'DELETED_AT_SOURCE' ? 'REMOVED' : status,
    startedAt: row.startedAt.toISOString(),
    until: row.until ? row.until.toISOString() : null,
    removedAt: row.removedAt ? row.removedAt.toISOString() : null,
    ...(isStaff ? { subjectName: row.subjectName } : {}),
  };
}

/// Подменяет сырую строку зеркала в обращении безопасным видом.
export function withMirrorView<
  T extends { appealedMinecraftPunishment?: AppealedMirrorRow | null },
>(
  report: T,
  nowMs: number,
  isStaff: boolean,
): Omit<T, 'appealedMinecraftPunishment'> & {
  appealedMinecraftPunishment: AppealedMinecraftPunishmentView | null;
} {
  const { appealedMinecraftPunishment, ...rest } = report;
  return {
    ...rest,
    appealedMinecraftPunishment: appealedMinecraftPunishment
      ? toAppealedMirrorView(appealedMinecraftPunishment, nowMs, isStaff)
      : null,
  };
}
