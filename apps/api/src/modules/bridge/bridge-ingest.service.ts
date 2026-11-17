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

/// Короткая транзакция журнала (статус received); применение - вне неё (5.2, R121).
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

    const logKey = { serverSlug: ctx.slug, eventId: ev.eventId };
    try {
      // Шаг 1 (короткая транзакция, без обращений к Redis и источнику):
      // запись `received`. ON CONFLICT DO NOTHING: конфликт не обрывает
      // транзакцию.
      const step1 = await this.prisma.$transaction(async (tx) => {
        const inserted = await tx.bridgeEventLog.createMany({
          data: [{ ...logKey, type: ev.type, status: 'received', payloadHash: hash }],
          skipDuplicates: true,
        });
        if (inserted.count === 1) return 'new' as const;
        const existing = await tx.bridgeEventLog.findUnique({
          where: { serverSlug_eventId: logKey },
          select: { payloadHash: true, status: true },
        });
        if (existing === null) return 'new' as const;
        if (existing.payloadHash !== hash) return 'conflict' as const;
        // `received` - применение не завершено (сбой между шагами): повтор
        // применяется заново; применение идемпотентно (upsert по ключу).
        return existing.status === 'received'
          ? ('retry' as const)
          : ('duplicate' as const);
      }, TX_OPTIONS);
      if (step1 === 'conflict') return reject('conflict');
      if (step1 === 'duplicate') {
        return { eventId: ev.eventId, status: 'duplicate' };
      }

      // Шаг 2 (вне транзакции): применение под блокировкой записи. Событие,
      // которое прямо сейчас применяет другой запрос, ждёт его завершения и
      // получает `duplicate`; применение, упавшее на полпути, повторяется.
      return await this.redis.withRecordLock(
        ctx.slug,
        kind,
        sourceId,
        async (): Promise<EventResult> => {
          const current = await this.prisma.bridgeEventLog.findUnique({
            where: { serverSlug_eventId: logKey },
            select: { payloadHash: true, status: true },
          });
          if (current !== null && current.status === 'applied') {
            return { eventId: ev.eventId, status: 'duplicate' };
          }
          // Порядок определяет приёмник: событие старше применённого
          // состояния записи по `occurredAt` - stale; при равенстве побеждает
          // принятое позже. Захват маркера - атомарный Lua (M2).
          if (!(await this.redis.claimMarker(ctx.slug, kind, sourceId, occurredMs))) {
            await this.prisma.bridgeEventLog.deleteMany({
              where: { ...logKey, status: 'received' },
            });
            return { eventId: ev.eventId, status: 'stale' };
          }
          await this.source.publish(sourceEvent);
          // Шаг 3: `applied`; строка могла быть удалена очисткой журнала.
          const updated = await this.prisma.bridgeEventLog.updateMany({
            where: logKey,
            data: { status: 'applied' },
          });
          if (updated.count === 0) {
            await this.prisma.bridgeEventLog.createMany({
              data: [{ ...logKey, type: ev.type, status: 'applied', payloadHash: hash }],
              skipDuplicates: true,
            });
          }
          return { eventId: ev.eventId, status: 'accepted' };
        },
      );
    } catch (err) {
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
