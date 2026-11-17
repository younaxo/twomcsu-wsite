import {
  NormalizedPunishment,
  PunishmentKind,
  PunishmentStatus,
} from './punishment.types';

/// Хранилище зеркала и состояния синхронизации. Сервис синхронизации зависит
/// только от этого интерфейса: боевая реализация — на Prisma
/// (`PrismaPunishmentMirrorStore`), в тестах — реализация в памяти.
export const PUNISHMENT_MIRROR_STORE = Symbol('PUNISHMENT_MIRROR_STORE');

export interface SyncStateSnapshot {
  cursorId: bigint;
  lastPollAt: Date | null;
  lastSuccessAt: Date | null;
  lastActiveCheckAt: Date | null;
  lastFullReconcileAt: Date | null;
  consecutiveFailures: number;
  lastErrorCode: string | null;
  initialSyncDoneAt: Date | null;
}

export type SyncStatePatch = Partial<Omit<SyncStateSnapshot, 'cursorId'>>;

export const EMPTY_SYNC_STATE: SyncStateSnapshot = {
  cursorId: 0n,
  lastPollAt: null,
  lastSuccessAt: null,
  lastActiveCheckAt: null,
  lastFullReconcileAt: null,
  consecutiveFailures: 0,
  lastErrorCode: null,
  initialSyncDoneAt: null,
};

/// Изменение зеркала, попавшее в запись (неизменённые строки не возвращаются).
export interface MirrorChange {
  kind: PunishmentKind;
  sourceId: string;
  /// true — строка вставлена впервые.
  inserted: boolean;
  rev: number;
  status: PunishmentStatus;
}

export interface PunishmentMirrorStore {
  getState(source: string, kind: PunishmentKind): Promise<SyncStateSnapshot>;
  patchState(
    source: string,
    kind: PunishmentKind,
    patch: SyncStatePatch,
  ): Promise<void>;
  /// Одна транзакция: upsert строк по `(kind, sourceId)` с проверкой `rowHash`
  /// и (если задан) продвижение курсора до `max(текущий, cursorId)`.
  /// Строка без изменений хеша не пишется и в результат не попадает.
  applyBatch(
    source: string,
    kind: PunishmentKind,
    rows: NormalizedPunishment[],
    cursorId: bigint | null,
    now: Date,
  ): Promise<MirrorChange[]>;
  /// id строк со статусом ACTIVE по возрастанию, строго после `afterId`.
  listActiveIds(
    source: string,
    kind: PunishmentKind,
    afterId: bigint,
    limit: number,
  ): Promise<bigint[]>;
  /// id всех строк, не помеченных DELETED_AT_SOURCE, в диапазоне
  /// `afterId < id <= upToId` (`upToId = null` — без верхней границы).
  listMirroredIds(
    source: string,
    kind: PunishmentKind,
    afterId: bigint,
    upToId: bigint | null,
  ): Promise<bigint[]>;
  /// Пометить строки как исчезнувшие в источнике (мягко, данные остаются).
  markDeletedAtSource(
    source: string,
    kind: PunishmentKind,
    ids: bigint[],
    now: Date,
  ): Promise<MirrorChange[]>;
  /// ACTIVE -> EXPIRED для строк с `until <= now` (слой T).
  expireDue(source: string, now: Date): Promise<MirrorChange[]>;
}
