import { createHash } from 'crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { compareFreshness } from './inventory-freshness';
import { SERVER_SLUG } from './inventory-limits';
import {
  applyChanges,
  assertRowSize,
  hashSlots,
  parseDelta,
  parseSnapshot,
  reparseStoredSlots,
} from './inventory-normalize';
import {
  INVENTORY_STORE,
  type InventoryDecision,
  type InventoryStore,
  type StoredInventory,
} from './inventory.store';
import {
  EpochOutOfRangeError,
  InventoryValidationError,
  type ApplyResult,
  type NormalizedDelta,
  type NormalizedSnapshot,
} from './inventory.types';

const FUTURE_EPOCH_WARN_MS = 120_000;
const FUTURE_EPOCH_WARN_EVERY_MS = 10 * 60_000;

/// Применение событий `inventory.snapshot` и `inventory.delta` (ADR-0168,
/// раздел 4.2; ADR-0179). Не зависит от источника: приёмник Bridge (этап 03)
/// вызывает методы с `serverSlug` из `key-id` (не из тела) и необработанным
/// `data`. Здесь нет подписи, лимитов запросов и дедупликации по `eventId`
/// (журнал Redis — задача приёмника).
@Injectable()
export class InventoryApplyService {
  private readonly logger = new Logger(InventoryApplyService.name);
  /// Последний вывод предупреждения по ряду (серверный ключ + хеш игрока):
  /// не чаще раза в 10 минут, размер ограничен.
  private readonly futureEpochWarned = new Map<string, number>();

  constructor(
    @Inject(INVENTORY_STORE) private readonly store: InventoryStore,
  ) {}

  applySnapshot(
    serverSlug: string,
    data: unknown,
    now: Date = new Date(),
  ): Promise<ApplyResult> {
    return this.run(
      serverSlug,
      () => parseSnapshot(data, now),
      (p, userId) => this.decideSnapshot(p, now, { serverSlug, userId }),
    );
  }

  applyDelta(
    serverSlug: string,
    data: unknown,
    now: Date = new Date(),
  ): Promise<ApplyResult> {
    return this.run(
      serverSlug,
      () => parseDelta(data, now),
      (p) => this.decideDelta(p, now),
    );
  }

  /// Применение снимка, собранного из частей (раздел 4.4, шаг П5). Привязка
  /// UUID перечитывается: с проверки при создании сборки прошло до 120 с.
  /// Отвязан — `unknown_player`; привязан другой пользователь —
  /// `resync_required`. Свежесть решается здесь же (`epoch`, затем `rev`).
  async applyAssembled(
    serverSlug: string,
    expectedUserId: string,
    snapshot: NormalizedSnapshot,
    now: Date = new Date(),
  ): Promise<ApplyResult> {
    if (!SERVER_SLUG.test(serverSlug)) {
      return { status: 'rejected', code: 'invalid_data', reason: 'serverSlug' };
    }
    const userId = await this.store.findUserIdByUuid(snapshot.uuid);
    if (userId === null) {
      return { status: 'rejected', code: 'unknown_player' };
    }
    if (userId !== expectedUserId) return { status: 'resync_required' };
    return this.store.mutate(
      { userId, serverSlug, group: snapshot.group },
      this.decideSnapshot(snapshot, now, { serverSlug, userId }),
    );
  }

  private async run<T extends NormalizedSnapshot | NormalizedDelta>(
    serverSlug: string,
    parse: () => T,
    decide: (
      parsed: T,
      userId: string,
    ) => (current: StoredInventory | null) => InventoryDecision,
  ): Promise<ApplyResult> {
    if (!SERVER_SLUG.test(serverSlug)) {
      return { status: 'rejected', code: 'invalid_data', reason: 'serverSlug' };
    }
    let parsed: T;
    try {
      parsed = parse();
    } catch (error) {
      if (error instanceof EpochOutOfRangeError) {
        return {
          status: 'rejected',
          code: 'epoch_out_of_range',
          reason: error.reason,
        };
      }
      if (error instanceof InventoryValidationError) {
        return {
          status: 'rejected',
          code: 'invalid_data',
          reason: error.reason,
        };
      }
      throw error;
    }
    // Только привязанные UUID (раздел 7.5): непривязанным рядов не создаём.
    const userId = await this.store.findUserIdByUuid(parsed.uuid);
    if (userId === null) {
      return { status: 'rejected', code: 'unknown_player' };
    }
    return this.store.mutate(
      { userId, serverSlug, group: parsed.group },
      decide(parsed, userId),
    );
  }

  private decideSnapshot(
    snapshot: NormalizedSnapshot,
    now: Date,
    who: { serverSlug: string; userId: string },
  ) {
    return (current: StoredInventory | null): InventoryDecision => {
      const contentHash = hashSlots(snapshot.slots);
      const meta = {
        epoch: snapshot.epoch,
        rev: snapshot.rev,
        capturedAt: snapshot.capturedAt,
        lastSeenAt: now,
        playerOnline: snapshot.playerOnline,
      };
      // Единый порядок свежести (раздел 3.5; одно правило для одиночного и
      // собранного снимка, `applyAssembled` идёт сюда же): `epoch`, затем
      // `rev`; `capturedAt` не участвует. Применяется ТОЛЬКО строго более
      // свежий, как `WHERE (epoch, rev) < (EXCLUDED.epoch, EXCLUDED.rev)`.
      // Равные `(epoch, rev)` повторно не применяются: ряд не хранит
      // `snapshotId` (схема БД не менялась), поэтому повтор отличается по
      // `contentHash`: тот же состав — повтор применённого (`applied`,
      // `contentChanged: false`, запись не выполняется, как «snapshot_applied
      // без изменений»); другой состав — `stale`.
      if (current) {
        const order = compareFreshness(snapshot, current);
        if (order < 0) {
          this.warnIfRowEpochAhead(current, now, who);
          return { write: null, result: { status: 'stale' } };
        }
        if (order === 0) {
          if (current.contentHash === contentHash) {
            return {
              write: null,
              result: {
                status: 'applied',
                kind: 'snapshot',
                contentChanged: false,
              },
            };
          }
          return { write: null, result: { status: 'stale' } };
        }
      }
      if (current && current.contentHash === contentHash) {
        return {
          write: { kind: 'touch', ...meta },
          result: {
            status: 'applied',
            kind: 'snapshot',
            contentChanged: false,
          },
        };
      }
      return {
        write: { kind: 'write', ...meta, slots: snapshot.slots, contentHash },
        result: { status: 'applied', kind: 'snapshot', contentChanged: true },
      };
    };
  }

  /// Ряд с `epoch` из будущего (более 120 с вперёд от часов приёмника) глушит
  /// все честные снимки как `stale` (раздел 16.3 контракта). Предупреждение
  /// без персональных данных: сервер, хеш `userId`, `epoch`.
  private warnIfRowEpochAhead(
    current: StoredInventory,
    now: Date,
    who: { serverSlug: string; userId: string },
  ): void {
    if (!/^[0-9]{1,16}$/.test(current.epoch)) return;
    const aheadMs = Number(current.epoch) - now.getTime();
    if (aheadMs <= FUTURE_EPOCH_WARN_MS) return;
    const user = createHash('sha256')
      .update(who.userId)
      .digest('hex')
      .slice(0, 12);
    const key = `${who.serverSlug}|${user}`;
    const last = this.futureEpochWarned.get(key);
    if (
      last !== undefined &&
      now.getTime() - last < FUTURE_EPOCH_WARN_EVERY_MS
    ) {
      return;
    }
    if (this.futureEpochWarned.size >= 1000) this.futureEpochWarned.clear();
    this.futureEpochWarned.set(key, now.getTime());
    this.logger.warn(
      `inventory snapshot stale: row epoch ahead of clock server=${who.serverSlug} user=${user} epoch=${current.epoch} ahead_s=${Math.round(aheadMs / 1000)}`,
    );
  }

  private decideDelta(delta: NormalizedDelta, now: Date) {
    return (current: StoredInventory | null): InventoryDecision => {
      // Нет базы или чужая эпоха — нужен полный снимок.
      if (!current || current.epoch !== delta.epoch) {
        return { write: null, result: { status: 'resync_required' } };
      }
      // Повтор или опоздавшая дельта: ревизия уже применена.
      if (delta.rev <= current.rev || delta.capturedAt < current.capturedAt) {
        return { write: null, result: { status: 'stale' } };
      }
      // Строго по `baseRev`; пропуск ревизии — resync.
      if (delta.baseRev !== current.rev) {
        return { write: null, result: { status: 'resync_required' } };
      }
      const slots = applyChanges(
        reparseStoredSlots(current.slots).filter((s) =>
          delta.group === 'ender' ? s.area === 'ender' : s.area !== 'ender',
        ),
        delta.changes,
      );
      try {
        assertRowSize(slots);
      } catch (error) {
        if (error instanceof InventoryValidationError) {
          return {
            write: null,
            result: {
              status: 'rejected',
              code: 'invalid_data',
              reason: error.reason,
            },
          };
        }
        throw error;
      }
      const contentHash = hashSlots(slots);
      const meta = {
        epoch: delta.epoch,
        rev: delta.rev,
        capturedAt: delta.capturedAt,
        lastSeenAt: now,
        playerOnline: delta.playerOnline,
      };
      if (contentHash === current.contentHash) {
        return {
          write: { kind: 'touch', ...meta },
          result: { status: 'applied', kind: 'delta', contentChanged: false },
        };
      }
      return {
        write: { kind: 'write', ...meta, slots, contentHash },
        result: { status: 'applied', kind: 'delta', contentChanged: true },
      };
    };
  }
}
