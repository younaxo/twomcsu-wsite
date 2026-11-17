import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { payloadHash } from './bridge-crypto';
import {
  BridgePunishmentSource,
  BridgeSourceEvent,
} from './bridge-punishment.source';
import { BridgeRedisService } from './bridge-redis.service';
import {
  BridgeBatch,
  BridgeEventEnvelope,
  PunishmentEventType,
  parseHello,
  parseOverflow,
  parsePunishmentData,
} from './bridge-schema';
import { BRIDGE_CONFIG, BridgeConfig } from './bridge.config';
import {
  MAX_EVENT_DATA_BYTES,
  OCCURRED_MAX_AGE_MS,
  OCCURRED_MAX_FUTURE_MS,
} from './bridge.constants';
import { BridgeAuthContext } from './bridge.types';

export type EventStatus = 'accepted' | 'duplicate' | 'stale' | 'rejected';
export type EventCode =
  'invalid_data' | 'unsupported_type' | 'server_mismatch' | 'conflict';

export interface EventResult {
  eventId: string;
  status: EventStatus;
  code?: EventCode;
}

/// Запись журнала дедупликации и применение в ОДНОЙ транзакции БД (5.2).
const TX_OPTIONS = { maxWait: 2000, timeout: 6000 } as const;
/// Не обновлять `lastSeenAt` чаще раза в 30 с (нагрузка на БД).
const LAST_SEEN_STEP_MS = 30_000;
const SLOW_RETRY_AFTER_S = 2;

const PUNISHMENT_TYPES: ReadonlySet<string> = new Set([
  'punishment.created',
  'punishment.updated',
  'punishment.removed',
  'punishment.deleted',
]);

/// Событие старше уже применённого состояния записи: откат транзакции.
class StaleSignal extends Error {}

/// Приём пачки (раздел 7 контракта): сервер из ключа, capabilities до
/// применения, диспетчер по типу. Исключения применения (Redis, БД, нет
/// подписчика) не превращаются в `rejected`: они уходят вызывающему (503,
/// плагин повторит ту же пачку). В журнал и логи тело `data` не попадает.
@Injectable()
export class BridgeIngestService {
  private readonly logger = new Logger(BridgeIngestService.name);

  constructor(
    @Inject(BRIDGE_CONFIG) private readonly config: BridgeConfig,
    private readonly prisma: PrismaService,
    private readonly redis: BridgeRedisService,
    private readonly source: BridgePunishmentSource,
  ) {}

  async ingest(
    ctx: BridgeAuthContext,
    batch: BridgeBatch,
  ): Promise<EventResult[]> {
    const started = Date.now();
    const results: EventResult[] = [];
    for (const ev of batch.events) {
      const result = await this.handle(ctx, ev, started);
      if (result.status !== 'accepted' && result.status !== 'duplicate') {
        this.logger.warn(
          `bridge event key=${ctx.keyId} id=${ev.eventId} type=${ev.type} result=${result.status}${result.code ? `/${result.code}` : ''}`,
        );
      }
      results.push(result);
    }
    await this.touchServer(ctx, batch, started);
    if (Date.now() - started > this.config.applyLatencyLimitMs) {
      try {
        await this.redis.markSlow(ctx.keyId, SLOW_RETRY_AFTER_S);
      } catch {
        // Подсказка для backpressure вспомогательная.
      }
    }
    return results;
  }

  private async handle(
    ctx: BridgeAuthContext,
    ev: BridgeEventEnvelope,
    nowMs: number,
  ): Promise<EventResult> {
    const reject = (code: EventCode): EventResult => ({
      eventId: ev.eventId,
      status: 'rejected',
      code,
    });
    // serverId события обязан совпадать со slug из ключа.
    if (ev.serverId !== ctx.slug) return reject('server_mismatch');
    if (
      Buffer.byteLength(JSON.stringify(ev.data), 'utf8') > MAX_EVENT_DATA_BYTES
    ) {
      return reject('invalid_data');
    }

    if (ev.type === 'bridge.hello') {
      const hello = parseHello(ev.data);
      if (!hello.ok) return reject('invalid_data');
      await this.prisma.bridgeServer.update({
        where: { id: ctx.server.id },
        data: {
          pluginVersion: hello.value.pluginVersion,
          platform: hello.value.platform,
        },
      });
      return { eventId: ev.eventId, status: 'accepted' };
    }
    if (ev.type === 'queue.overflow') {
      const overflow = parseOverflow(ev.data);
      if (!overflow.ok) return reject('invalid_data');
      this.logger.warn(
        `bridge queue.overflow key=${ctx.keyId} dropped=${overflow.value.dropped}`,
      );
      return { eventId: ev.eventId, status: 'accepted' };
    }
    if (PUNISHMENT_TYPES.has(ev.type)) {
      // Capabilities проверяются до применения.
      if (!ctx.capabilities.has('punishments')) {
        return reject('unsupported_type');
      }
      return this.handlePunishment(ctx, ev, nowMs);
    }
    // player.* (срез 1 - выключено), будущие и неизвестные типы.
    return reject('unsupported_type');
  }

  private async handlePunishment(
    ctx: BridgeAuthContext,
    ev: BridgeEventEnvelope,
    nowMs: number,
  ): Promise<EventResult> {
    const reject = (code: EventCode): EventResult => ({
      eventId: ev.eventId,
      status: 'rejected',
      code,
    });
    const occurredMs = ev.occurredAt.getTime();
    // Границы `occurredAt` (5.3): событие из далёкого будущего не должно
    // делать следующие события записи устаревшими.
    if (
      occurredMs < nowMs - OCCURRED_MAX_AGE_MS ||
      occurredMs > nowMs + OCCURRED_MAX_FUTURE_MS
    ) {
      return reject('invalid_data');
    }
    const parsed = parsePunishmentData(
      ev.type as PunishmentEventType,
      ev.data,
      ev.occurredAt,
      nowMs,
    );
    if (!parsed.ok) return reject('invalid_data');

    const hash = payloadHash(ev.data);
    const event = parsed.value;
    const kind = event.type === 'deleted' ? event.kind : event.punishment.kind;
    const sourceId =
      event.type === 'deleted' ? event.sourceId : event.punishment.sourceId;
    const sourceEvent: BridgeSourceEvent =
      event.type === 'deleted'
        ? {
            type: 'deleted',
            kind: event.kind,
            sourceId: event.sourceId,
            serverSlug: ctx.slug,
            sourceScope: ctx.server.sourceScope,
          }
        : {
            type: event.type,
            punishment: event.punishment,
            serverSlug: ctx.slug,
            sourceScope: ctx.server.sourceScope,
          };

    try {
      return await this.prisma.$transaction(async (tx) => {
        // ON CONFLICT DO NOTHING: конфликт не обрывает транзакцию.
        const inserted = await tx.bridgeEventLog.createMany({
          data: [
            {
              serverSlug: ctx.slug,
              eventId: ev.eventId,
              type: ev.type,
              status: 'applied',
              payloadHash: hash,
            },
          ],
          skipDuplicates: true,
        });
        if (inserted.count === 0) {
          const existing = await tx.bridgeEventLog.findUnique({
            where: {
              serverSlug_eventId: { serverSlug: ctx.slug, eventId: ev.eventId },
            },
            select: { payloadHash: true },
          });
          if (existing !== null && existing.payloadHash !== hash) {
            return reject('conflict');
          }
          return { eventId: ev.eventId, status: 'duplicate' as const };
        }
        // Порядок определяет приёмник: событие старше применённого состояния
        // записи по `occurredAt` - stale; при равенстве побеждает принятое позже.
        const marker = await this.redis.getMarker(ctx.slug, kind, sourceId);
        if (marker !== null && occurredMs < marker) throw new StaleSignal();
        await this.source.publish(sourceEvent);
        await this.redis.advanceMarker(ctx.slug, kind, sourceId, occurredMs);
        return { eventId: ev.eventId, status: 'accepted' as const };
      }, TX_OPTIONS);
    } catch (err) {
      if (err instanceof StaleSignal) {
        return { eventId: ev.eventId, status: 'stale' };
      }
      this.logger.error(
        `bridge apply failed key=${ctx.keyId} id=${ev.eventId} type=${ev.type} error=${err instanceof Error ? err.name : 'unknown'}`,
      );
      throw err;
    }
  }

  /// `lastSeenAt`, протокол и расхождение часов (по `sentAt`); вспомогательно,
  /// сбой не влияет на ответ.
  private async touchServer(
    ctx: BridgeAuthContext,
    batch: BridgeBatch,
    nowMs: number,
  ): Promise<void> {
    const last = ctx.server.lastSeenAt?.getTime() ?? 0;
    if (nowMs - last < LAST_SEEN_STEP_MS) return;
    try {
      await this.prisma.bridgeServer.update({
        where: { id: ctx.server.id },
        data: {
          lastSeenAt: new Date(nowMs),
          lastProtocol: 1,
          // Колонка Int (32 бита): расхождение ограничено ±24 суток.
          clockSkewMs: Math.max(
            -2_000_000_000,
            Math.min(2_000_000_000, Math.trunc(nowMs - batch.sentAt.getTime())),
          ),
        },
      });
    } catch {
      this.logger.warn(`bridge touch failed key=${ctx.keyId}`);
    }
  }
}
