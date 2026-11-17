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

/// Параметры транзакции `applyBatch` согласованы с TTL блокировки лидера
/// (LEADER_LOCK_TTL_MS = 10 с): сервис продлевает блокировку непосредственно
/// перед записью, поэтому ожидание соединения плюс сама транзакция обязаны
/// уложиться в TTL с запасом. Пачка до 500 строк в норме пишется за 1–2 с.
export const APPLY_TX_MAX_WAIT_MS = 2000;
export const APPLY_TX_TIMEOUT_MS = 6000;
/// Размер группы id в одном SQL-запросе: далеко от лимита PostgreSQL
/// (32767 параметров) даже при будущем росте числа параметров на строку.
export const SQL_ID_CHUNK = 1000;

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
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
  /// Явно задать курсор (в том числе ниже текущего): после сверки при откате
  /// источника. Обычное продвижение курсора — только через `applyBatch`.
  setCursor(
    source: string,
    kind: PunishmentKind,
    cursorId: bigint,
  ): Promise<void>;
  /// id строк EXPIRED, у которых `until` позже `now` (признак ошибочного
  /// истечения из-за расхождения часов); до `limit` штук.
  listExpiredWithFutureUntil(
    source: string,
    kind: PunishmentKind,
    now: Date,
    limit: number,
  ): Promise<bigint[]>;
  /// EXPIRED -> ACTIVE для перечисленных строк (источник подтвердил, что они
  /// действуют).
  reactivate(
    source: string,
    kind: PunishmentKind,
    ids: bigint[],
    now: Date,
  ): Promise<MirrorChange[]>;
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
