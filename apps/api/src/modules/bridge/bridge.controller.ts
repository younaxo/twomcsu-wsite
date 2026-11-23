import {
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { BridgeDeliveryService } from './bridge-delivery.service';
import { parseAckBody, parseClaimBody } from './bridge-delivery-schema';
import { BridgeIngestService } from './bridge-ingest.service';
import { BridgeRateLimitGuard } from './bridge-rate-limit.guard';
import {
  CONCURRENT_REQUESTS,
  EVENTS_PER_MINUTE,
  BridgeRedisService,
  REQUESTS_BURST_PER_SECOND,
} from './bridge-redis.service';
import { parseEnvelope } from './bridge-schema';
import { BridgeSignatureGuard } from './bridge-signature.guard';
import {
  forbidden,
  invalidEnvelope,
  tooManyRequests,
  unauthorized,
  unavailable,
} from './bridge-errors';
import { BRIDGE_CONFIG, BridgeConfig } from './bridge.config';
import {
  BRIDGE_PROTOCOL,
  DELIVERY_POLL_AFTER_MS,
  MAX_EVENT_DATA_BYTES,
  MAX_EVENTS_PER_BATCH,
} from './bridge.constants';
import { BridgeRequest } from './bridge.types';

/// Приёмник Bridge v1. Порядок guard'ов важен: подпись, затем лимит по
/// `key-id`. Грубый лимит по подсети - глобальный throttler; для хоста игрового
/// сервера он расширен (в среднем 10 запросов в секунду на ключ плюс запас).
/// Тела ответов об ошибках - без деталей.
@Controller('bridge/v1')
@Throttle({ default: { limit: 1200, ttl: 60_000 } })
@UseGuards(BridgeSignatureGuard, BridgeRateLimitGuard)
export class BridgeController {
  private readonly logger = new Logger(BridgeController.name);

  constructor(
    @Inject(BRIDGE_CONFIG) private readonly config: BridgeConfig,
    private readonly ingest: BridgeIngestService,
    private readonly redis: BridgeRedisService,
    private readonly delivery: BridgeDeliveryService,
  ) {}

  @Get('handshake')
  handshake() {
    return {
      minProtocol: BRIDGE_PROTOCOL,
      maxProtocol: BRIDGE_PROTOCOL,
      serverTime: new Date().toISOString(),
      limits: {
        maxBodyBytes: this.config.maxBodyBytes,
        maxEventsPerBatch: MAX_EVENTS_PER_BATCH,
        maxEventBytes: MAX_EVENT_DATA_BYTES,
        requestsBurst: REQUESTS_BURST_PER_SECOND,
        eventsPerMinute: EVENTS_PER_MINUTE,
        concurrentRequests: CONCURRENT_REQUESTS,
      },
      features: {
        punishments: true,
        player_events: false,
        snapshot: false,
      },
    };
  }

  @Post('events')
  @HttpCode(HttpStatus.OK)
  async events(
    @Req() req: BridgeRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ctx = req.bridge;
    if (ctx === undefined) throw unauthorized();

    let slot = false;
    try {
      slot = await this.redis.acquireSlot(ctx.keyId);
    } catch {
      throw unavailable(res, 5);
    }
    if (!slot) throw tooManyRequests(res, 1);

    try {
      const parsed = parseEnvelope(req.body);
      if (!parsed.ok) throw invalidEnvelope();
      const retry = await this.redis.eventsRetryAfter(
        ctx.keyId,
        parsed.value.events.length,
      );
      if (retry > 0) throw tooManyRequests(res, retry);

      const results = await this.ingest.ingest(ctx, parsed.value);
      return { results, serverTime: new Date().toISOString() };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      // Redis, БД или подписчик недоступны: плагин повторит ту же пачку.
      this.logger.error(`bridge events unavailable key=${ctx.keyId}`);
      throw unavailable(res, 5);
    } finally {
      try {
        await this.redis.releaseSlot(ctx.keyId);
      } catch {
        // Слот сам истечёт по TTL.
      }
    }
  }

  /// Плагин забирает задания выдачи (0.13, ADR-0194). Выключено флагом ->
  /// 503; у сервера нет возможности `delivery` -> 403.
  @Post('delivery/claim')
  @HttpCode(HttpStatus.OK)
  async deliveryClaim(
    @Req() req: BridgeRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ctx = this.deliveryContext(req, res);
    const parsed = parseClaimBody(req.body);
    if (!parsed.ok) throw invalidEnvelope();
    try {
      const jobs = await this.delivery.claim(ctx.slug, parsed.value.max);
      return {
        jobs,
        pollAfterMs: DELIVERY_POLL_AFTER_MS,
        serverTime: new Date().toISOString(),
      };
    } catch {
      this.logger.error(`bridge delivery claim unavailable key=${ctx.keyId}`);
      throw unavailable(res, 5);
    }
  }

  /// Подтверждение исхода сервером; идемпотентно по `jobId` и `claimToken`.
  @Post('delivery/ack')
  @HttpCode(HttpStatus.OK)
  async deliveryAck(
    @Req() req: BridgeRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ctx = this.deliveryContext(req, res);
    const parsed = parseAckBody(req.body);
    if (!parsed.ok) throw invalidEnvelope();
    try {
      const results = [];
      for (const item of parsed.value.results) {
        results.push(await this.delivery.ack(ctx.slug, item));
      }
      return { results, serverTime: new Date().toISOString() };
    } catch {
      this.logger.error(`bridge delivery ack unavailable key=${ctx.keyId}`);
      throw unavailable(res, 5);
    }
  }

  private deliveryContext(req: BridgeRequest, res: Response) {
    const ctx = req.bridge;
    if (ctx === undefined) throw unauthorized();
    if (!this.delivery.isOperational()) throw unavailable(res, 30);
    if (!ctx.capabilities.has('delivery')) throw forbidden();
    return ctx;
  }
}
