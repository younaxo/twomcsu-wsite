import {
  Controller,
  Get,
  HttpCode,
  HttpException,
  Inject,
  Logger,
  Post,
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
  COOKIE_PATH,
  PUBLIC_PER_IP_MIN,
  SESSION_COOKIE,
  SESSION_COOKIE_MAX_AGE_S,
} from './giveaway.constants';
import { parseCodesBody } from './giveaway-bodies';
import {
  GiveawayCodesService,
  GiveawayLimitError,
} from './giveaway-codes.service';
import {
  invalidEnvelope,
  tooManyRequests,
  unavailable,
} from './giveaway-errors';
import { GiveawayRedisService } from './giveaway-redis.service';

/// Читает одну cookie из заголовка без cookie-parser (его нет в режиме
/// GIVEAWAY_ONLY).
export function readCookie(
  header: string | undefined,
  name: string,
): string | null {
  if (header === undefined) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

/// Публичные пути страницы розыгрыша (ADR-G002 п. 3-5). Без подписи; доступ к
/// статусу - только по cookie-сессии. Тела ошибок без деталей, логи без кодов,
/// токенов сессий и IP.
@Controller(['api/giveaway/v1', 'giveaway/v1'])
@Throttle({ default: { limit: 300, ttl: 60_000 } })
export class GiveawayPublicController {
  private readonly logger = new Logger(GiveawayPublicController.name);

  constructor(
    private readonly codes: GiveawayCodesService,
    private readonly redis: GiveawayRedisService,
    @Inject(GIVEAWAY_CONFIG) private readonly config: GiveawayConfig,
  ) {}

  private noStore(res: Response): void {
    res.setHeader('Cache-Control', 'no-store');
  }

  private ensureOperational(): void {
    if (!isGiveawayOperational(this.config)) throw unavailable();
  }

  private fail(err: unknown, res: Response, what: string): never {
    if (err instanceof GiveawayLimitError) {
      if (err.kind === 'rate_limited')
        throw tooManyRequests(res, err.retryAfterS);
      if (err.kind === 'captcha_failed') {
        throw new HttpException({ error: 'captcha_failed' }, 400);
      }
      throw new HttpException({ error: 'captcha_unavailable' }, 503);
    }
    if (err instanceof HttpException) throw err;
    this.logger.error(`giveaway ${what} failed`);
    throw unavailable(res, 5);
  }

  @Post('codes')
  @HttpCode(200)
  async issue(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.ensureOperational();
    this.noStore(res);
    const captchaToken = parseCodesBody(req.body);
    if (captchaToken === null) throw invalidEnvelope();
    const token = readCookie(req.headers.cookie, SESSION_COOKIE);
    try {
      const r = await this.codes.issue(token, req.ip, captchaToken);
      res.cookie(SESSION_COOKIE, r.sessionToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: COOKIE_PATH,
        maxAge: SESSION_COOKIE_MAX_AGE_S * 1000,
      });
      return {
        code: r.code,
        expiresAt: r.expiresAt.toISOString(),
        ttlSeconds: r.ttlSeconds,
      };
    } catch (err) {
      return this.fail(err, res, 'codes');
    }
  }

  @Get('codes/status')
  async status(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.ensureOperational();
    this.noStore(res);
    try {
      return await this.codes.status(
        readCookie(req.headers.cookie, SESSION_COOKIE),
      );
    } catch (err) {
      return this.fail(err, res, 'status');
    }
  }

  @Get('public')
  async info(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.ensureOperational();
    this.noStore(res);
    try {
      const retry = await this.redis.hit(
        'public-net',
        rateLimitKey(req.ip),
        PUBLIC_PER_IP_MIN,
        60,
      );
      if (retry > 0) throw new GiveawayLimitError('rate_limited', retry);
      return await this.codes.publicInfo();
    } catch (err) {
      return this.fail(err, res, 'public');
    }
  }
}
