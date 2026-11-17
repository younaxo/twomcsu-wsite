import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  MirrorChange,
  PUNISHMENT_MIRROR_STORE,
  PunishmentMirrorStore,
  SyncStateSnapshot,
} from './punishment-mirror.store';
import {
  Disposable,
  NormalizedPunishment,
  PUNISHMENT_KINDS,
  PunishmentKind,
  PunishmentSource,
  PunishmentStatus,
  SourceAuthFailed,
  SourceError,
  SourceSchemaMismatch,
  publicRef,
} from './punishment.types';
import { PunishmentsConfig } from './punishments.config';
import {
  PUNISHMENTS_CONFIG,
  PUNISHMENTS_RUNTIME,
  PUNISHMENT_SOURCE,
  PunishmentsRuntime,
} from './punishments.tokens';

/// Размер страницы сверки активных записей (`fetchByIds` берёт до 500).
const ACTIVE_CHECK_PAGE = 500;
/// Сколько пачек за один запуск опроса (дальше — на следующем запуске).
const MAX_BATCHES_PER_RUN = 20;
/// Опрос серверного времени источника (раздел 4.5).
const CLOCK_CHECK_INTERVAL_MS = 60_000;
/// Пауза между пачками полной сверки: не нагружать чужую БД.
const RECONCILE_PAUSE_MS = 50;
/// Пауза экспоненциальной задержки после сбоя: 1..30 с с джиттером.
const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 30_000;
/// Отставание, после которого публичная страница показывает «неактуально».
export const STALE_AFTER_MS = 60_000;

export const NEEDS_RECONCILE = 'NEEDS_RECONCILE';
export const SOURCE_EMPTY = 'SOURCE_EMPTY';

export type PunishmentChangeType =
  'created' | 'updated' | 'expired' | 'deleted';

/// Событие изменения зеркала для будущих потребителей (WebSocket, срез 3).
/// Во время первичной загрузки события не рассылаются.
export interface PunishmentChangeEvent {
  type: PunishmentChangeType;
  kind: PunishmentKind;
  sourceId: string;
  ref: string;
  rev: number;
  status: PunishmentStatus;
}

export type PunishmentsSyncState =
  | 'not_configured'
  | 'initial_sync'
  | 'ok'
  | 'degraded'
  | 'needs_reconcile'
  | 'halted';

export interface PunishmentsSyncStatus {
  state: PunishmentsSyncState;
  /// Для `not_configured`: выключено флагом или нет источника (адаптер).
  reason?: 'disabled' | 'no_source';
  source?: string;
  /// Данные могут быть неактуальны (нет успешного опроса дольше минуты).
  stale: boolean;
  kinds: Array<{
    kind: PunishmentKind;
    cursorId: string;
    initialSyncDone: boolean;
    lastSuccessAt: Date | null;
    consecutiveFailures: number;
    lastErrorCode: string | null;
  }>;
}

/// Лидерство потеряно посреди работы: тихо прервать запуск.
class LeadershipLost extends Error {}

type Heartbeat = () => Promise<boolean>;

/// Синхронизация зеркала наказаний (раздел 4 дизайна). Слои:
///   0 — первичная загрузка по водяному знаку (события не рассылаются);
///   1 — новые строки с перекрытием `overlap` по id;
///   2 — сверка активных строк (`fetchByIds`);
///   3 — полная сверка по диапазонам id (удаления, правки неактивных);
///   T — истечение по `until` силами сайта.
/// Без источника или при выключенной интеграции сервис бездействует.
/// Планировщик (`PunishmentsScheduler`) вызывает `runOnce` и держит лидерство.
@Injectable()
export class PunishmentsSyncService {
  private readonly logger = new Logger(PunishmentsSyncService.name);
  private readonly handlers = new Set<(e: PunishmentChangeEvent) => void>();
  private readonly halted = new Map<PunishmentKind | '*', string>();
  private clockOffsetMs = 0;
  private lastClockCheckAt = 0;
  private backoffUntil = 0;
  private failures = 0;

  constructor(
    @Optional()
    @Inject(PUNISHMENT_SOURCE)
    private readonly source: PunishmentSource | null,
    @Inject(PUNISHMENT_MIRROR_STORE)
    private readonly store: PunishmentMirrorStore,
    @Inject(PUNISHMENTS_CONFIG) private readonly config: PunishmentsConfig,
    @Inject(PUNISHMENTS_RUNTIME) private readonly runtime: PunishmentsRuntime,
  ) {}

  /// Источник задан и интеграция включена; иначе модуль бездействует.
  get isConfigured(): boolean {
    return this.source !== null && this.config.enabled;
  }

  onChange(handler: (event: PunishmentChangeEvent) => void): Disposable {
    this.handlers.add(handler);
    return { dispose: () => void this.handlers.delete(handler) };
  }

  /// Один проход: слои 0/1/2/3 по каждому типу и таймер истечения.
  /// `heartbeat` вызывается между пачками; `false` — лидерство потеряно.
  async runOnce(heartbeat?: Heartbeat): Promise<void> {
    const source = this.source;
    if (source === null || !this.config.enabled) return;
    if (this.halted.has('*')) return;
    const nowReal = this.runtime.now();
    if (nowReal < this.backoffUntil) return;

    try {
      await this.refreshClock(source, nowReal);
      const nowSource = nowReal + this.clockOffsetMs;
      for (const kind of PUNISHMENT_KINDS) {
        if (this.halted.has(kind)) continue;
        try {
          await this.syncKind(source, kind, nowReal, heartbeat);
        } catch (error) {
          if (error instanceof SourceSchemaMismatch) {
            // Остановить опрос этой таблицы, остальные продолжают.
            this.halted.set(kind, error.code);
            await this.safePatch(kind, { lastErrorCode: error.code });
            this.logger.error(`Опрос ${kind} остановлен: ${error.code}`);
            continue;
          }
          throw error;
        }
      }
      const expired = await this.store.expireDue(
        source.id,
        new Date(nowSource),
      );
      this.emit(expired, 'expired');
      this.failures = 0;
    } catch (error) {
      if (error instanceof LeadershipLost) return;
      await this.handleFailure(error, nowReal);
    }
  }

  async getStatus(): Promise<PunishmentsSyncStatus> {
    if (this.source === null || !this.config.enabled) {
      return {
        state: 'not_configured',
        reason: this.config.enabled ? 'no_source' : 'disabled',
        stale: false,
        kinds: [],
      };
    }
    const sourceId = this.source.id;
    const kinds: PunishmentsSyncStatus['kinds'] = [];
    for (const kind of PUNISHMENT_KINDS) {
      const s = await this.store.getState(sourceId, kind);
      kinds.push({
        kind,
        cursorId: s.cursorId.toString(),
        initialSyncDone: s.initialSyncDoneAt !== null,
        lastSuccessAt: s.lastSuccessAt,
        consecutiveFailures: s.consecutiveFailures,
        lastErrorCode: s.lastErrorCode,
      });
    }
    const now = this.runtime.now();
    let state: PunishmentsSyncState = 'ok';
    if (this.halted.size > 0) state = 'halted';
    else if (
      kinds.some(
        (k) =>
          k.lastErrorCode === NEEDS_RECONCILE ||
          k.lastErrorCode === SOURCE_EMPTY,
      )
    ) {
      state = 'needs_reconcile';
    } else if (
      this.failures > 0 ||
      kinds.some((k) => k.consecutiveFailures > 0)
    ) {
      state = 'degraded';
    } else if (kinds.some((k) => !k.initialSyncDone)) state = 'initial_sync';
    const stale =
      state === 'degraded' &&
      kinds.every(
        (k) =>
          k.lastSuccessAt === null ||
          now - k.lastSuccessAt.getTime() > STALE_AFTER_MS,
      );
    return { state, source: sourceId, stale, kinds };
  }

  // ---------------------------------------------------------------------

  private async refreshClock(
    source: PunishmentSource,
    nowReal: number,
  ): Promise<void> {
    if (nowReal - this.lastClockCheckAt < CLOCK_CHECK_INTERVAL_MS) return;
    const health = await source.health();
    if (health.ok && Number.isFinite(health.serverTimeMs)) {
      this.clockOffsetMs = health.serverTimeMs - nowReal;
    }
    this.lastClockCheckAt = nowReal;
  }

  private async syncKind(
    source: PunishmentSource,
    kind: PunishmentKind,
    nowReal: number,
    heartbeat: Heartbeat | undefined,
  ): Promise<void> {
    const sourceId = source.id;
    const date = new Date(nowReal);
    const state = await this.store.getState(sourceId, kind);
    let forceReconcile = state.lastErrorCode === NEEDS_RECONCILE;
    let initialDone = state.initialSyncDoneAt !== null;

    const maxId = await source.maxId(kind);
    if (initialDone && maxId < state.cursorId) {
      // БД источника откатилась или восстановлена из бэкапа: курсор не
      // сбрасывается автоматически, данные не теряются, нужна сверка.
      forceReconcile = true;
      await this.store.patchState(sourceId, kind, {
        lastErrorCode: NEEDS_RECONCILE,
      });
    } else {
      const reachedEnd = await this.poll(
        source,
        kind,
        state,
        date,
        !initialDone,
        heartbeat,
      );
      if (!initialDone && reachedEnd) {
        initialDone = true;
        await this.store.patchState(sourceId, kind, {
          initialSyncDoneAt: date,
        });
      }
    }

    let reconciled = false;
    let reconcileAborted = false;
    if (initialDone) {
      if (
        this.isDue(
          state.lastActiveCheckAt,
          this.config.activeCheckIntervalMs,
          nowReal,
        )
      ) {
        await this.activeCheck(source, kind, date, heartbeat);
        await this.store.patchState(sourceId, kind, {
          lastActiveCheckAt: date,
        });
      }
      if (
        forceReconcile ||
        this.isDue(
          state.lastFullReconcileAt,
          this.config.reconcileIntervalMs,
          nowReal,
        )
      ) {
        reconciled = await this.fullReconcile(source, kind, date, heartbeat);
        reconcileAborted = !reconciled;
        if (reconciled) {
          await this.store.patchState(sourceId, kind, {
            lastFullReconcileAt: date,
          });
        }
      }
    }

    // Код «требует сверки» и «источник пуст» снимается только успешной
    // полной сверкой; прочие коды сбоев — любым успешным проходом.
    const keepError =
      reconcileAborted ||
      ((forceReconcile || state.lastErrorCode === SOURCE_EMPTY) && !reconciled);
    await this.store.patchState(sourceId, kind, {
      lastPollAt: date,
      lastSuccessAt: date,
      consecutiveFailures: 0,
      ...(keepError ? {} : { lastErrorCode: null }),
    });
  }

  /// Слои 0 и 1: пачки `fetchBatch` от курсора (с перекрытием в обычном
  /// режиме). Возвращает true, если достигнут конец данных источника.
  private async poll(
    source: PunishmentSource,
    kind: PunishmentKind,
    state: SyncStateSnapshot,
    date: Date,
    initial: boolean,
    heartbeat: Heartbeat | undefined,
  ): Promise<boolean> {
    const limit = this.config.batchSize;
    const overlap = BigInt(this.config.overlap);
    let afterId = state.cursorId;
    if (!initial) {
      afterId = state.cursorId > overlap ? state.cursorId - overlap : 0n;
    }
    for (let i = 0; i < MAX_BATCHES_PER_RUN; i++) {
      await this.beat(heartbeat);
      const batch = await source.fetchBatch(kind, afterId, limit);
      // Пачка считается полной по сырому числу строк, включая пропущенные
      // как невалидные: иначе пропуск оборвал бы чтение раньше конца.
      const skipped = source.drainSkippedIds?.(kind) ?? [];
      const raw = batch.length + skipped.length;
      const lastValid = batch.length > 0 ? maxSourceId(batch) : 0n;
      const lastRaw = maxBigint(lastValid, skipped);
      if (batch.length > 0) {
        const changes = await this.store.applyBatch(
          source.id,
          kind,
          batch,
          lastValid,
          date,
        );
        if (!initial) this.emitChanges(changes);
      }
      if (raw >= limit && lastRaw <= afterId) return false;
      afterId = lastRaw > afterId ? lastRaw : afterId;
      if (raw < limit) return true;
    }
    return false;
  }

  /// Слой 2: сверка всех ACTIVE-строк зеркала пачками по 500.
  private async activeCheck(
    source: PunishmentSource,
    kind: PunishmentKind,
    date: Date,
    heartbeat: Heartbeat | undefined,
  ): Promise<void> {
    let after = 0n;
    for (;;) {
      await this.beat(heartbeat);
      const ids = await this.store.listActiveIds(
        source.id,
        kind,
        after,
        ACTIVE_CHECK_PAGE,
      );
      if (ids.length === 0) return;
      const { found, missing } = await source.fetchByIds(kind, ids);
      this.emitChanges(
        await this.store.applyBatch(source.id, kind, found, null, date),
      );
      if (missing.length > 0) {
        this.emit(
          await this.store.markDeletedAtSource(source.id, kind, missing, date),
          'deleted',
        );
      }
      after = ids[ids.length - 1];
      if (ids.length < ACTIVE_CHECK_PAGE) return;
    }
  }

  /// Слой 3: полное чтение таблицы источника по диапазонам id, сравнение
  /// `rowHash` с зеркалом и пометка исчезнувших строк. Возвращает false, если
  /// сверка прервана как подозрительная (пустой источник при непустом зеркале).
  private async fullReconcile(
    source: PunishmentSource,
    kind: PunishmentKind,
    date: Date,
    heartbeat: Heartbeat | undefined,
  ): Promise<boolean> {
    const limit = this.config.batchSize;
    let after = 0n;
    for (;;) {
      await this.beat(heartbeat);
      const batch = await source.fetchBatch(kind, after, limit);
      // Строки, пропущенные адаптером как невалидные (SourceDataInvalid),
      // в источнике есть: их нельзя помечать DELETED_AT_SOURCE.
      const skipped = source.drainSkippedIds?.(kind) ?? [];
      const raw = batch.length + skipped.length;
      const last =
        raw > 0
          ? maxBigint(batch.length > 0 ? maxSourceId(batch) : 0n, skipped)
          : after;
      const full = raw >= limit;
      if (full && last <= after) return false;
      const mirrored = await this.store.listMirroredIds(
        source.id,
        kind,
        after,
        full ? last : null,
      );
      if (raw === 0 && after === 0n && mirrored.length > 0) {
        // Пустой источник при непустом зеркале: массовую пометку не делаем.
        await this.store.patchState(source.id, kind, {
          lastErrorCode: SOURCE_EMPTY,
        });
        return false;
      }
      if (batch.length > 0) {
        this.emitChanges(
          await this.store.applyBatch(source.id, kind, batch, null, date),
        );
      }
      const present = new Set(batch.map((r) => r.sourceId));
      for (const id of skipped) present.add(id.toString());
      const missing = mirrored.filter((id) => !present.has(id.toString()));
      if (missing.length > 0) {
        this.emit(
          await this.store.markDeletedAtSource(source.id, kind, missing, date),
          'deleted',
        );
      }
      if (!full) return true;
      after = last;
      await this.runtime.sleep(RECONCILE_PAUSE_MS);
    }
  }

  private async beat(heartbeat: Heartbeat | undefined): Promise<void> {
    if (heartbeat && !(await heartbeat())) throw new LeadershipLost();
  }

  private isDue(
    last: Date | null,
    intervalMs: number,
    nowReal: number,
  ): boolean {
    return last === null || nowReal - last.getTime() >= intervalMs;
  }

  private emitChanges(changes: MirrorChange[]): void {
    for (const change of changes) {
      this.dispatch({
        type: change.inserted ? 'created' : 'updated',
        kind: change.kind,
        sourceId: change.sourceId,
        ref: publicRef(change.kind, change.sourceId),
        rev: change.rev,
        status: change.status,
      });
    }
  }

  private emit(changes: MirrorChange[], type: PunishmentChangeType): void {
    for (const change of changes) {
      this.dispatch({
        type,
        kind: change.kind,
        sourceId: change.sourceId,
        ref: publicRef(change.kind, change.sourceId),
        rev: change.rev,
        status: change.status,
      });
    }
  }

  private dispatch(event: PunishmentChangeEvent): void {
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch (error) {
        this.logger.warn(
          `Обработчик событий наказаний завершился ошибкой: ${(error as Error).name}`,
        );
      }
    }
  }

  private async safePatch(
    kind: PunishmentKind,
    patch: Parameters<PunishmentMirrorStore['patchState']>[2],
  ): Promise<void> {
    if (this.source === null) return;
    try {
      await this.store.patchState(this.source.id, kind, patch);
    } catch {
      // Состояние не записалось: следующая попытка повторит.
    }
  }

  /// Сбой: SourceAuthFailed не повторяется (тревога); остальное — пауза
  /// 1..30 с с джиттером и счётчик сбоев. Тексты не содержат секретов:
  /// в журнал пишется только код и имя класса ошибки.
  private async handleFailure(error: unknown, nowReal: number): Promise<void> {
    const code =
      error instanceof SourceError ? error.code : 'SYNC_INTERNAL_ERROR';
    if (error instanceof SourceAuthFailed) {
      this.halted.set('*', code);
      this.logger.error(`Синхронизация наказаний остановлена: ${code}`);
    } else {
      this.failures += 1;
      const exp = Math.min(
        BACKOFF_MAX_MS,
        BACKOFF_BASE_MS * 2 ** Math.min(this.failures - 1, 10),
      );
      const jitter = 0.5 + this.runtime.random() * 0.5;
      this.backoffUntil = nowReal + Math.round(exp * jitter);
      this.logger.warn(
        `Сбой синхронизации наказаний (${code}), попытка ${this.failures}`,
      );
    }
    for (const kind of PUNISHMENT_KINDS) {
      // Флаги «требует сверки» и «источник пуст» снимаются только успешной
      // сверкой: код обычного сбоя их не затирает.
      let keepFlag = false;
      if (this.source !== null) {
        try {
          const prev = (await this.store.getState(this.source.id, kind))
            .lastErrorCode;
          keepFlag = prev === NEEDS_RECONCILE || prev === SOURCE_EMPTY;
        } catch {
          // Состояние не прочиталось: пишем только счётчики.
          keepFlag = true;
        }
      }
      await this.safePatch(kind, {
        ...(keepFlag ? {} : { lastErrorCode: code }),
        consecutiveFailures: this.failures,
        lastPollAt: new Date(nowReal),
      });
    }
  }
}

function maxBigint(start: bigint, ids: bigint[]): bigint {
  let max = start;
  for (const id of ids) if (id > max) max = id;
  return max;
}

function maxSourceId(batch: NormalizedPunishment[]): bigint {
  let max = 0n;
  for (const row of batch) {
    const id = BigInt(row.sourceId);
    if (id > max) max = id;
  }
  return max;
}
