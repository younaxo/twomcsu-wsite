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
/// Тревога: сверка нашла «пропавшими» подозрительно большую долю зеркала;
/// пометка DELETED_AT_SOURCE не выполнена. Снимается успешной плановой сверкой.
export const MASS_DELETE_SUSPECTED = 'MASS_DELETE_SUSPECTED';
/// Сверка не продвигается по id (пачка полна, но максимум не растёт).
export const RECONCILE_STALLED = 'RECONCILE_STALLED';
/// Тревога: часы сайта и источника расходятся больше допуска; опрос на паузе.
export const CLOCK_SKEW = 'CLOCK_SKEW';
/// Явный флаг владельца/админа (записывается вручную в состояние): выполнить
/// сверку БЕЗ порога массового удаления (настоящая массовая чистка LiteBans).
export const RECONCILE_APPROVED = 'RECONCILE_APPROVED';

/// Допуск расхождения часов сайта и источника (дизайн 4.5): 5 с.
export const CLOCK_TOLERANCE_MS = 5000;
/// Порог массовой пометки: если при сверке пропало больше этой доли
/// зеркальных строк, при зеркале не меньше MASS_DELETE_MIN_ROWS — пометка не
/// выполняется, ставится тревога. Обоснование 50%: настоящее удаление
/// (`--delete`, prune) обычно задевает малую долю; откат БД из бэкапа
/// теряет хвост id, а «почти всё пропало» — признак чужой/пустой/усечённой БД.
/// Малые зеркала (до 10 строк) порогом не защищаются: доля там не информативна.
export const MASS_DELETE_MAX_RATIO = 0.5;
export const MASS_DELETE_MIN_ROWS = 10;
/// Размер страницы перепроверки ошибочно истёкших строк.
const PREMATURE_EXPIRY_PAGE = 500;

/// Коды, которые не затирает обычный проход и сбой: снимаются только
/// успешной полной сверкой.
const STICKY_CODES: ReadonlySet<string> = new Set([
  NEEDS_RECONCILE,
  SOURCE_EMPTY,
  MASS_DELETE_SUSPECTED,
  RECONCILE_STALLED,
  RECONCILE_APPROVED,
]);

function isSticky(code: string | null): boolean {
  return code !== null && STICKY_CODES.has(code);
}

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

/// Итог первой фазы по типу: что нужно сделать во второй (сверка).
interface KindPlan {
  kind: PunishmentKind;
  date: Date;
  initialDone: boolean;
  /// Сверка нужна сейчас (флаг, откат источника или плановое окно).
  reconcileDue: boolean;
  /// Игнорировать порог массового удаления (явный флаг RECONCILE_APPROVED).
  ignoreMassGuard: boolean;
  /// Откат источника: после сверки курсор опускается до этого значения.
  rollbackMaxId: bigint | null;
  /// Тревога первой фазы (сохраняется, если сверка не выполнялась).
  alarm: string | null;
}

type ReconcileResult = { ok: true } | { ok: false; code: string };

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
  private clockSkewed = false;
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
      if (this.clockSkewed) {
        // Пауза: без достоверного времени «истёк» считать нельзя.
        await this.flagClockSkew(source);
        return;
      }
      const nowSource = nowReal + this.clockOffsetMs;
      // Фаза 1: быстрые слои 0/1/2 по всем типам. Тяжёлая полная сверка
      // идёт после них, чтобы не задерживать опрос других типов.
      const plans: KindPlan[] = [];
      for (const kind of PUNISHMENT_KINDS) {
        if (this.halted.has(kind)) continue;
        await this.guardKind(kind, async () => {
          plans.push(
            await this.syncKind(source, kind, nowReal, nowSource, heartbeat),
          );
        });
      }
      // Фаза 2: полная сверка (слой 3).
      for (const plan of plans) {
        if (this.halted.has(plan.kind)) continue;
        await this.guardKind(plan.kind, () =>
          this.reconcileKind(source, plan, heartbeat),
        );
      }
      await this.beat(heartbeat);
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

  /// Остановка опроса таблицы при несоответствии схемы: остальные продолжают.
  private async guardKind(
    kind: PunishmentKind,
    fn: () => Promise<void>,
  ): Promise<void> {
    try {
      await fn();
    } catch (error) {
      if (error instanceof SourceSchemaMismatch) {
        this.halted.set(kind, error.code);
        await this.safePatch(kind, { lastErrorCode: error.code });
        this.logger.error(`Опрос ${kind} остановлен: ${error.code}`);
        return;
      }
      throw error;
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
    else if (kinds.some((k) => isSticky(k.lastErrorCode))) {
      state = 'needs_reconcile';
    } else if (
      this.failures > 0 ||
      kinds.some(
        (k) => k.consecutiveFailures > 0 || k.lastErrorCode === CLOCK_SKEW,
      )
    ) {
      state = 'degraded';
    } else if (kinds.some((k) => !k.initialSyncDone)) state = 'initial_sync';
    // Устаревание не зависит от состояния: умерший лидер оставляет «ok».
    const stale = kinds.every(
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
    // При расхождении часов проверяем каждый проход: пауза снимается сразу
    // после исправления, а не через минуту.
    if (
      !this.clockSkewed &&
      nowReal - this.lastClockCheckAt < CLOCK_CHECK_INTERVAL_MS
    ) {
      return;
    }
    const health = await source.health();
    if (health.ok && Number.isFinite(health.serverTimeMs)) {
      const offset = health.serverTimeMs - nowReal;
      if (Math.abs(offset) > CLOCK_TOLERANCE_MS) {
        if (!this.clockSkewed) {
          this.logger.error(
            `Расхождение часов с источником наказаний ${Math.round(offset / 1000)} с больше допуска ${CLOCK_TOLERANCE_MS / 1000} с: синхронизация приостановлена`,
          );
        }
        this.clockSkewed = true;
      } else {
        if (this.clockSkewed) {
          this.logger.log(
            'Расхождение часов в пределах допуска: опрос возобновлён',
          );
        }
        this.clockSkewed = false;
        this.clockOffsetMs = offset;
      }
    }
    this.lastClockCheckAt = nowReal;
  }

  /// Тревога расхождения часов: код пишется, кроме типов с флагом сверки.
  private async flagClockSkew(source: PunishmentSource): Promise<void> {
    for (const kind of PUNISHMENT_KINDS) {
      try {
        const prev = (await this.store.getState(source.id, kind)).lastErrorCode;
        if (!isSticky(prev)) {
          await this.store.patchState(source.id, kind, {
            lastErrorCode: CLOCK_SKEW,
          });
        }
      } catch {
        // Состояние не записалось: следующий проход повторит.
      }
    }
  }

  /// Фаза 1: слои 0/1/2 для одного типа. Полную сверку выполняет
  /// `reconcileKind` после обработки всех типов.
  private async syncKind(
    source: PunishmentSource,
    kind: PunishmentKind,
    nowReal: number,
    nowSource: number,
    heartbeat: Heartbeat | undefined,
  ): Promise<KindPlan> {
    const sourceId = source.id;
    const date = new Date(nowReal);
    const state = await this.store.getState(sourceId, kind);
    const approved = state.lastErrorCode === RECONCILE_APPROVED;
    let forceReconcile = approved || state.lastErrorCode === NEEDS_RECONCILE;
    let initialDone = state.initialSyncDoneAt !== null;
    let rollbackMaxId: bigint | null = null;

    const maxId = await source.maxId(kind);
    if (initialDone && maxId < state.cursorId) {
      // БД источника откатилась или восстановлена из бэкапа: данные не
      // теряются, нужна сверка. Курсор опускается ОДИН раз — после сверки
      // (`reconcileKind`), иначе откат повторялся бы на каждом тике.
      forceReconcile = true;
      rollbackMaxId = maxId;
      if (state.lastErrorCode !== NEEDS_RECONCILE && !approved) {
        await this.store.patchState(sourceId, kind, {
          lastErrorCode: NEEDS_RECONCILE,
        });
      }
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

    let alarm: string | null = null;
    if (
      initialDone &&
      this.isDue(
        state.lastActiveCheckAt,
        this.config.activeCheckIntervalMs,
        nowReal,
      )
    ) {
      alarm = await this.activeCheck(source, kind, date, nowSource, heartbeat);
      await this.store.patchState(sourceId, kind, {
        lastActiveCheckAt: date,
      });
    }

    const reconcileDue =
      initialDone &&
      (forceReconcile ||
        this.isDue(
          state.lastFullReconcileAt,
          this.config.reconcileIntervalMs,
          nowReal,
        ));

    // Коды «требует сверки», «источник пуст» и тревоги сверки снимаются
    // только сверкой (фаза 2); прочие коды сбоев — любым успешным проходом.
    const keepError = forceReconcile || isSticky(state.lastErrorCode);
    await this.store.patchState(sourceId, kind, {
      lastPollAt: date,
      lastSuccessAt: date,
      consecutiveFailures: 0,
      ...(alarm !== null
        ? { lastErrorCode: alarm }
        : keepError
          ? {}
          : { lastErrorCode: null }),
    });
    return {
      kind,
      date,
      initialDone,
      reconcileDue,
      ignoreMassGuard: approved,
      rollbackMaxId,
      alarm,
    };
  }

  /// Фаза 2: полная сверка. Любой исход (успех или тревога) фиксируется как
  /// попытка в `lastFullReconcileAt`, поэтому сверка не повторяется до
  /// планового окна; при откате источника курсор опускается до `maxId`.
  private async reconcileKind(
    source: PunishmentSource,
    plan: KindPlan,
    heartbeat: Heartbeat | undefined,
  ): Promise<void> {
    if (!plan.reconcileDue) return;
    const result = await this.fullReconcile(
      source,
      plan.kind,
      plan.date,
      heartbeat,
      plan.ignoreMassGuard,
    );
    await this.store.patchState(source.id, plan.kind, {
      lastFullReconcileAt: plan.date,
      lastErrorCode: result.ok ? null : result.code,
    });
    if (plan.rollbackMaxId !== null) {
      // Зеркало сверено с откатившимся источником: водяной знак по id
      // возвращается к его максимуму, иначе новые строки с id ниже старого
      // курсора не читались бы. Запись идемпотентна, повторное чтение безвредно.
      await this.beat(heartbeat);
      await this.store.setCursor(source.id, plan.kind, plan.rollbackMaxId);
    }
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
      const skipped = source.drainSkippedIds(kind);
      const raw = batch.length + skipped.length;
      const lastValid = batch.length > 0 ? maxSourceId(batch) : 0n;
      const lastRaw = maxBigint(lastValid, skipped);
      if (batch.length > 0) {
        // Токен лидера проверяется (и продлевается) прямо перед записью.
        await this.beat(heartbeat);
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

  /// Слой 2: сверка всех ACTIVE-строк зеркала пачками по 500 и перепроверка
  /// ошибочно истёкших. Возвращает код тревоги или null.
  private async activeCheck(
    source: PunishmentSource,
    kind: PunishmentKind,
    date: Date,
    nowSource: number,
    heartbeat: Heartbeat | undefined,
  ): Promise<string | null> {
    let after = 0n;
    let total = 0;
    const missingAll: bigint[] = [];
    for (;;) {
      await this.beat(heartbeat);
      const ids = await this.store.listActiveIds(
        source.id,
        kind,
        after,
        ACTIVE_CHECK_PAGE,
      );
      if (ids.length === 0) break;
      const { found, missing } = await source.fetchByIds(kind, ids);
      if (found.length > 0) {
        await this.beat(heartbeat);
        this.emitChanges(
          await this.store.applyBatch(source.id, kind, found, null, date),
        );
      }
      missingAll.push(...missing);
      total += ids.length;
      after = ids[ids.length - 1];
      if (ids.length < ACTIVE_CHECK_PAGE) break;
    }
    const alarm = await this.markMissing(
      source,
      kind,
      missingAll,
      total,
      date,
      heartbeat,
      false,
    );
    await this.recheckPrematureExpiry(source, kind, date, nowSource, heartbeat);
    return alarm;
  }

  /// Строки EXPIRED с `until` в будущем (по времени источника): сайт мог
  /// истечь их по неверным часам. Источник — истина: действующие по его
  /// данным возвращаются в ACTIVE.
  private async recheckPrematureExpiry(
    source: PunishmentSource,
    kind: PunishmentKind,
    date: Date,
    nowSource: number,
    heartbeat: Heartbeat | undefined,
  ): Promise<void> {
    const ids = await this.store.listExpiredWithFutureUntil(
      source.id,
      kind,
      new Date(nowSource),
      PREMATURE_EXPIRY_PAGE,
    );
    if (ids.length === 0) return;
    const { found } = await source.fetchByIds(kind, ids);
    const restore = found
      .filter((row) => row.status === 'ACTIVE')
      .map((row) => BigInt(row.sourceId));
    if (restore.length === 0) return;
    await this.beat(heartbeat);
    this.emitChanges(
      await this.store.applyBatch(source.id, kind, found, null, date),
    );
    await this.beat(heartbeat);
    this.emit(
      await this.store.reactivate(source.id, kind, restore, date),
      'updated',
    );
  }

  /// Пометка пропавших строк с защитой от массовой пометки: если пропала
  /// больше `MASS_DELETE_MAX_RATIO` зеркала (при зеркале не меньше
  /// `MASS_DELETE_MIN_ROWS`), пометка не выполняется и возвращается код
  /// тревоги. Пометка идёт группами (лимит параметров запроса).
  private async markMissing(
    source: PunishmentSource,
    kind: PunishmentKind,
    missing: bigint[],
    total: number,
    date: Date,
    heartbeat: Heartbeat | undefined,
    ignoreGuard: boolean,
  ): Promise<string | null> {
    if (missing.length === 0) return null;
    if (
      !ignoreGuard &&
      total >= MASS_DELETE_MIN_ROWS &&
      missing.length / total > MASS_DELETE_MAX_RATIO
    ) {
      this.logger.error(
        `Сверка ${kind}: пропало ${missing.length} из ${total} строк зеркала, пометка не выполнена (${MASS_DELETE_SUSPECTED})`,
      );
      return MASS_DELETE_SUSPECTED;
    }
    await this.beat(heartbeat);
    this.emit(
      await this.store.markDeletedAtSource(source.id, kind, missing, date),
      'deleted',
    );
    return null;
  }

  /// Слой 3: полное чтение таблицы источника по диапазонам id, сравнение
  /// `rowHash` с зеркалом и пометка исчезнувших строк. Не выполняет пометку и
  /// возвращает код тревоги при пустом источнике, непродвигающейся сверке и
  /// массовой пропаже строк.
  private async fullReconcile(
    source: PunishmentSource,
    kind: PunishmentKind,
    date: Date,
    heartbeat: Heartbeat | undefined,
    ignoreMassGuard: boolean,
  ): Promise<ReconcileResult> {
    const limit = this.config.batchSize;
    let after = 0n;
    let total = 0;
    const missingAll: bigint[] = [];
    for (;;) {
      await this.beat(heartbeat);
      const batch = await source.fetchBatch(kind, after, limit);
      // Строки, пропущенные адаптером как невалидные (SourceDataInvalid),
      // в источнике есть: их нельзя помечать DELETED_AT_SOURCE.
      const skipped = source.drainSkippedIds(kind);
      const raw = batch.length + skipped.length;
      const last =
        raw > 0
          ? maxBigint(batch.length > 0 ? maxSourceId(batch) : 0n, skipped)
          : after;
      const full = raw >= limit;
      if (full && last <= after) {
        return { ok: false, code: RECONCILE_STALLED };
      }
      const mirrored = await this.store.listMirroredIds(
        source.id,
        kind,
        after,
        full ? last : null,
      );
      if (raw === 0 && after === 0n && mirrored.length > 0) {
        // Пустой источник при непустом зеркале: массовую пометку не делаем.
        return { ok: false, code: SOURCE_EMPTY };
      }
      if (batch.length > 0) {
        await this.beat(heartbeat);
        this.emitChanges(
          await this.store.applyBatch(source.id, kind, batch, null, date),
        );
      }
      total += mirrored.length;
      const present = new Set(batch.map((r) => r.sourceId));
      for (const id of skipped) present.add(id.toString());
      for (const id of mirrored) {
        if (!present.has(id.toString())) missingAll.push(id);
      }
      if (!full) break;
      after = last;
      await this.runtime.sleep(RECONCILE_PAUSE_MS);
    }
    const alarm = await this.markMissing(
      source,
      kind,
      missingAll,
      total,
      date,
      heartbeat,
      ignoreMassGuard,
    );
    return alarm === null ? { ok: true } : { ok: false, code: alarm };
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
      // Флаги «требует сверки», «источник пуст» и тревоги сверки снимаются
      // только успешной сверкой: код обычного сбоя их не затирает.
      let keepFlag = false;
      if (this.source !== null) {
        try {
          const prev = (await this.store.getState(this.source.id, kind))
            .lastErrorCode;
          keepFlag = isSticky(prev);
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
