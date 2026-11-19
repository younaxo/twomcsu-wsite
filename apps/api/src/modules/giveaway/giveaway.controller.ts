import {
  Controller,
  HttpException,
  HttpCode,
  Logger,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import {
  invalidEnvelope,
  tooManyRequests,
  unavailable,
} from './giveaway-errors';
import { GiveawayIngestService } from './giveaway-ingest.service';
import { GiveawayRedisService } from './giveaway-redis.service';
import { parseEnvelope } from './giveaway-schema';
import { GiveawaySignatureGuard } from './giveaway-signature.guard';
import { GiveawayRequest } from './giveaway.types';

/// Приёмник событий розыгрыша. Без `GIVEAWAY_ENABLED=true` и секрета - 503.
/// Публичный путь `/api/giveaway/v1/events` (вариант без `/api` - если прокси
/// срезает префикс). Тела ошибок без деталей.
@Controller(['api/giveaway/v1', 'giveaway/v1'])
@Throttle({ default: { limit: 300, ttl: 60_000 } })
@UseGuards(GiveawaySignatureGuard)
export class GiveawayController {
  private readonly logger = new Logger(GiveawayController.name);

  constructor(
    private readonly ingest: GiveawayIngestService,
    private readonly redis: GiveawayRedisService,
  ) {}

  @Post('events')
  @HttpCode(200)
  async events(
    @Req() req: GiveawayRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ctx = req.giveaway;
    if (ctx === undefined) throw unavailable();
    const events = parseEnvelope(req.body);
    if (events === null) throw invalidEnvelope();
    try {
      const retry = await this.redis.eventsRetryAfter(
        ctx.serverId,
        events.length,
      );
      if (retry > 0) {
        this.logger.warn(`giveaway rate limit: events key=${ctx.keyId}`);
        throw tooManyRequests(res, retry);
      }
      const result = await this.ingest.ingest(ctx.serverId, events);
      return result;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      this.logger.error(`giveaway ingest failed key=${ctx.keyId}`);
      throw unavailable(res, 5);
    }
  }
}
