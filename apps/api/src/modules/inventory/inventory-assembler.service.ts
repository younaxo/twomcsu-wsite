import { Inject, Injectable, Optional } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import {
  INVENTORY_ASSEMBLY_CONFIG,
  cutoffMs,
  resolveAssemblyConfig,
  type AssemblyConfig,
} from './inventory-assembly.config';
import {
  INVENTORY_ASSEMBLY_STORE,
  type FinishOutcome,
  type InventoryAssemblyStore,
  type OfferResult,
  type ProbeResult,
} from './inventory-assembly.store';
import { InventoryApplyService } from './inventory-apply.service';
import { compareFreshness } from './inventory-freshness';
import { SERVER_SLUG } from './inventory-limits';
import {
  EpochOutOfRangeError,
  assembleSnapshot,
  expectedSlotGroups,
  parseSnapshotPart,
  type NormalizedPart,
} from './inventory-parts';
import { InventoryRedisPolicyService } from './inventory-redis-policy.service';
import { INVENTORY_STORE, type InventoryStore } from './inventory.store';
import {
  InventoryValidationError,
  type ApplyResult,
  type NormalizedSnapshot,
} from './inventory.types';

const EVENT_ID = /^[0-9A-Za-z_-]{1,64}$/;

/// Результат приёма части. Транспортно-нейтральный: соответствие кодам
/// Bridge (`accepted part_buffered`, `snapshot_applied`, `duplicate`, `stale`,
/// `rejected <code>`, `503`/построчный `inventory_unavailable`) — задача
/// приёмника.
export type AssembleResult =
  | { status: 'buffered' }
  | { status: 'applied'; contentChanged: boolean }
  | { status: 'duplicate' }
  | { status: 'stale' }
  | {
      status: 'rejected';
      code:
        | 'invalid_data'
        | 'epoch_out_of_range'
        | 'snapshot_mismatch'
        | 'conflict'
        | 'resync_required'
        | 'unknown_player';
      /// Короткая причина без содержимого предметов и без UUID.
      reason: string;
    }
  | {
      status: 'unavailable';
      reason: 'redis' | 'db' | 'lock_busy' | 'lock_lost';
      retryAfterSec: number;
    };

/// Сборщик частей снимка (Q35; ADR-0168, раздел 4.4). Не зависит от
/// транспорта: приёмник Bridge (этап 03) вызывает `acceptPart` ПОСЛЕ проверки
/// подписи и ДО транзакции применения; `serverSlug` — из `key-id`, не из
/// тела. Сегодня вызывается только тестами.
@Injectable()
export class InventoryAssemblerService {
  private readonly config: AssemblyConfig;
  /// Счётчики `bridge_inventory_parts_total{result}` (раздел 4.4, метрики).
  readonly counters = new Map<string, number>();

  constructor(
    @Inject(INVENTORY_ASSEMBLY_STORE)
    private readonly buffer: InventoryAssemblyStore,
    @Inject(INVENTORY_STORE) private readonly rows: InventoryStore,
    private readonly apply: InventoryApplyService,
    private readonly policy: InventoryRedisPolicyService,
    @Optional()
    @Inject(INVENTORY_ASSEMBLY_CONFIG)
    config?: AssemblyConfig,
  ) {
    // Бросает, если TTLsvc < T + 90 с: приёмник не стартует сборку.
    this.config = config ?? resolveAssemblyConfig();
  }

  async acceptPart(
    serverSlug: string,
    eventId: string,
    data: unknown,
    now: Date = new Date(),
  ): Promise<AssembleResult> {
    const result = await this.run(serverSlug, eventId, data, now);
    const key =
      result.status === 'rejected' || result.status === 'unavailable'
        ? `${result.status}:${result.status === 'rejected' ? result.code : result.reason}`
        : result.status;
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);
    return result;
  }

  private async run(
    serverSlug: string,
    eventId: string,
    data: unknown,
    now: Date,
  ): Promise<AssembleResult> {
    // П0: до Redis и БД.
    if (!SERVER_SLUG.test(serverSlug)) {
      return rejected('invalid_data', 'serverSlug');
    }
    if (typeof eventId !== 'string' || !EVENT_ID.test(eventId)) {
      return rejected('invalid_data', 'eventId');
    }
    let part: NormalizedPart;
    try {
      part = parseSnapshotPart(data, now, this.config);
    } catch (error) {
      if (error instanceof EpochOutOfRangeError) {
        return rejected('epoch_out_of_range', error.reason);
      }
      if (error instanceof InventoryValidationError) {
        return rejected('invalid_data', error.reason);
      }
      throw error;
    }
    // П1: политика Redis (флаг в памяти процесса).
    if (!this.policy.isConfirmed()) {
      return rejected('resync_required', 'policy_blocked');
    }
    try {
      return await this.process(serverSlug, eventId, part, now);
    } catch (error) {
      if (error instanceof StageFailure) return error.result;
      throw error;
    }
  }

  private async process(
    serverSlug: string,
    eventId: string,
    part: NormalizedPart,
    now: Date,
  ): Promise<AssembleResult> {
    const uuidHash = createHash('sha256')
      .update(part.uuid)
      .digest('hex')
      .slice(0, 32);
    const expectedGroups = expectedSlotGroups(part.group, part.parts) ?? [];
    const token = randomUUID();
    let probe = await this.redis(() =>
      this.buffer.probe(serverSlug, part.snapshotId, eventId),
    );
    // Повторное зондирование допускается один раз (`reprobe`).
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const early = fromProbe(probe);
      if (early) return early;
      let userId: string | null = null;
      if (!probe.live) {
        // П3: только если живой сборки нет (часть создаёт новую).
        if (now.getTime() - part.capturedAt.getTime() > cutoffMs(this.config)) {
          return rejected('resync_required', 'cutoff');
        }
        userId = await this.db(() =>
          this.rows.findUserIdByUuid(part.uuid),
        );
        if (userId === null) return rejected('unknown_player', 'unlinked');
        const own = userId;
        const current = (
          await this.db(() => this.rows.listForUser(own, serverSlug))
        ).find((row) => row.group === part.group);
        if (current && compareFreshness(part, current) <= 0) {
          return { status: 'stale' };
        }
      }
      const offer = await this.redis(() =>
        this.buffer.offer({
          serverId: serverSlug,
          snapshotId: part.snapshotId,
          eventId,
          nowMs: now.getTime(),
          token,
          userId,
          probedLive: probe.live,
          part: {
            n: part.part,
            slotGroup: part.slotGroup,
            hash: part.hash,
            slotsJson: part.slotsJson,
            bytes: part.bytes,
          },
          header: {
            parts: part.parts,
            group: part.group,
            epoch: part.epoch,
            rev: part.rev,
            capturedAtMs: part.capturedAt.getTime(),
            playerOnline: part.playerOnline,
            uuidHash,
          },
          expectedGroups,
          config: this.config,
        }),
      );
      if (offer.kind === 'reprobe') {
        probe = await this.redis(() =>
          this.buffer.probe(serverSlug, part.snapshotId, eventId),
        );
        continue;
      }
      return this.afterOffer(serverSlug, eventId, part, offer, token, now);
    }
    return unavailable('redis');
  }

  private async afterOffer(
    serverSlug: string,
    eventId: string,
    part: NormalizedPart,
    offer: Exclude<OfferResult, { kind: 'reprobe' }>,
    token: string,
    now: Date,
  ): Promise<AssembleResult> {
    switch (offer.kind) {
      case 'buffered':
        return { status: 'buffered' };
      case 'duplicate':
        return { status: 'duplicate' };
      case 'stale':
        return { status: 'stale' };
      case 'rejected':
        return rejected(offer.code, offer.reason);
      case 'lock_busy':
        return unavailable('lock_busy');
      case 'complete':
        break;
    }

    // П5: применение полного комплекта (вне Redis-скрипта). Токен захвата
    // тот же, с которым выполнен `offer`.
    return this.applyComplete(serverSlug, eventId, part, offer, token, now);
  }

  private async applyComplete(
    serverSlug: string,
    eventId: string,
    part: NormalizedPart,
    offer: Extract<OfferResult, { kind: 'complete' }>,
    token: string,
    now: Date,
  ): Promise<AssembleResult> {
    const finish = (outcome: FinishOutcome) =>
      this.buffer.finish({
        serverId: serverSlug,
        snapshotId: part.snapshotId,
        eventId,
        token,
        outcome,
        nowMs: now.getTime(),
        userId: offer.userId,
        group: part.group,
        epoch: part.epoch,
        rev: part.rev,
        config: this.config,
      });

    let snapshot: NormalizedSnapshot;
    try {
      snapshot = assembleSnapshot(
        {
          uuid: part.uuid,
          group: part.group,
          parts: part.parts,
          epoch: part.epoch,
          rev: part.rev,
          capturedAt: part.capturedAt,
          playerOnline: part.playerOnline,
        },
        offer.parts,
      );
    } catch (error) {
      if (!(error instanceof InventoryValidationError)) throw error;
      await this.redis(() => finish('discard'));
      return rejected('invalid_data', error.reason);
    }

    let result: ApplyResult;
    try {
      result = await this.apply.applyAssembled(
        serverSlug,
        offer.userId,
        snapshot,
        now,
      );
    } catch {
      // Сбой БД (вариант «а»): сборка и части СОХРАНЯЮТСЯ, захват снимается,
      // `done` и `evt` завершающей части не пишутся; повтор применит снова.
      try {
        await finish('retry');
      } catch {
        // TTL захвата (30 с) остаётся страховкой.
      }
      return unavailable('db');
    }

    switch (result.status) {
      case 'applied': {
        const done = await this.redis(() => finish('applied'));
        if (!done.ok) return unavailable('lock_lost');
        return { status: 'applied', contentChanged: result.contentChanged };
      }
      case 'stale': {
        const done = await this.redis(() => finish('stale'));
        if (!done.ok) return unavailable('lock_lost');
        return { status: 'stale' };
      }
      case 'resync_required':
        await this.redis(() => finish('discard'));
        return rejected('resync_required', 'binding_changed');
      case 'rejected':
        await this.redis(() => finish('discard'));
        return rejected(result.code, result.reason ?? result.code);
    }
  }

  private async redis<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch {
      throw new StageFailure(unavailable('redis'));
    }
  }

  private async db<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch {
      throw new StageFailure(unavailable('db'));
    }
  }
}

class StageFailure extends Error {
  constructor(readonly result: AssembleResult) {
    super('assembly stage failure');
  }
}

function rejected(
  code: Extract<AssembleResult, { status: 'rejected' }>['code'],
  reason: string,
): AssembleResult {
  return { status: 'rejected', code, reason };
}

function unavailable(
  reason: Extract<AssembleResult, { status: 'unavailable' }>['reason'],
): AssembleResult {
  return { status: 'unavailable', reason, retryAfterSec: 1 };
}

/// Шаг П2: ответы по зонду. `done` проверяется первым: поздняя часть
/// применённого комплекта — `duplicate`, а не `stale`.
function fromProbe(probe: ProbeResult): AssembleResult | null {
  if (probe.done || probe.evt) return { status: 'duplicate' };
  switch (probe.mark) {
    case 'poison':
      return rejected('snapshot_mismatch', 'poisoned');
    case 'evicted':
      return rejected('resync_required', 'evicted');
    case 'superseded':
    case 'stale':
      return { status: 'stale' };
    default:
      return null;
  }
}
