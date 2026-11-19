import {
  Controller,
  Get,
  Inject,
  Logger,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { rateLimitKey } from '../../config/trust-proxy';
import {
  GIVEAWAY_CONFIG,
  GiveawayConfig,
  isGiveawayOperational,
} from './giveaway.config';
import {
  ADMIN_COOKIE,
  PUBLIC_PER_IP_MIN,
  STREAM_OPEN_PER_MIN,
} from './giveaway.constants';
import { parseMode } from './giveaway-admin-bodies';
import { GiveawayAdminAuthService } from './giveaway-admin-auth.service';
import { GiveawayMode } from './giveaway-data.service';
import { GiveawayDrawService } from './giveaway-draw.service';
import {
  notFound,
  tooManyRequests,
  unauthorized,
  unavailable,
} from './giveaway-errors';
import { readCookie } from './giveaway-public.controller';
import { GiveawayRedisService } from './giveaway-redis.service';
import { GiveawayStreamService } from './giveaway-stream.service';

/// Публичные итоги и SSE-эфир (ADR-G003 п. 6.2, 8). Режим `test` доступен
/// только с админ-сессией; публичный режим тестовых данных не видит.
@Controller(['api/giveaway/v1', 'giveaway/v1'])
@Throttle({ default: { limit: 300, ttl: 60_000 } })
export class GiveawayStreamController {
  private readonly logger = new Logger(GiveawayStreamController.name);

  constructor(
    private readonly draw: GiveawayDrawService,
    private readonly stream: GiveawayStreamService,
    private readonly redis: GiveawayRedisService,
    private readonly auth: GiveawayAdminAuthService,
    @Inject(GIVEAWAY_CONFIG) private readonly config: GiveawayConfig,
  ) {}

  private async mode(req: Request, raw: unknown): Promise<GiveawayMode> {
    const mode = parseMode(raw);
    if (mode === 'live') return mode;
    if (!this.config.admin.testModeEnabled)
      throw notFound('test_mode_disabled');
    const p = await this.auth.resolve(
      readCookie(req.headers.cookie, ADMIN_COOKIE),
    );
    if (p === null) throw unauthorized();
    return mode;
  }

  private async limit(
    scope: string,
    max: number,
    req: Request,
    res: Response,
  ): Promise<void> {
    let retry: number;
    try {
      retry = await this.redis.hit(scope, rateLimitKey(req.ip), max, 60);
    } catch {
      throw unavailable(res, 5);
    }
    if (retry > 0) throw tooManyRequests(res, retry);
  }

  @Get('public/results')
  async results(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Query('mode') mode?: unknown,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    if (!isGiveawayOperational(this.config)) throw unavailable();
    await this.limit('public-results', PUBLIC_PER_IP_MIN, req, res);
    return this.draw.publicResults(await this.mode(req, mode));
  }

  @Get('stream')
  async sse(
    @Req() req: Request,
    @Res() res: Response,
    @Query('mode') mode?: unknown,
  ): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');
    if (!isGiveawayOperational(this.config)) throw unavailable();
    await this.limit('stream-open', STREAM_OPEN_PER_MIN, req, res);
    const m = await this.mode(req, mode);
    const revision = (await this.draw.publicResults(m)).revision;
    const ok = await this.stream.attach(
      req,
      res,
      m,
      rateLimitKey(req.ip),
      revision,
    );
    if (!ok) {
      res.removeHeader('Content-Type');
      throw tooManyRequests(res, 5);
    }
    this.logger.debug('giveaway stream attached');
  }
}
