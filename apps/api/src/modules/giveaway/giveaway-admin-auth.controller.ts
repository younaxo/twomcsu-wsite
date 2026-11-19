import {
  Controller,
  Get,
  HttpCode,
  Inject,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
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
  ADMIN_ABSOLUTE_MS,
  ADMIN_COOKIE,
  ADMIN_COOKIE_PATH,
  ADMIN_LOGIN_PER_10MIN,
  ADMIN_OAUTH_COOKIE,
  ADMIN_OAUTH_COOKIE_PATH,
  ADMIN_OAUTH_TTL_S,
} from './giveaway.constants';
import { AdminRequest, GiveawayAdminGuard } from './giveaway-admin.guard';
import { GiveawayAdminAuthService } from './giveaway-admin-auth.service';
import { forbidden, tooManyRequests, unavailable } from './giveaway-errors';
import { readCookie } from './giveaway-public.controller';
import { GiveawayRedisService } from './giveaway-redis.service';

/// Вход и выход администратора (ADR-G003 п. 2). Коды OAuth, state, токены и
/// адреса в логи не попадают.
@Controller(['api/giveaway/v1/admin/auth', 'giveaway/v1/admin/auth'])
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class GiveawayAdminAuthController {
  private readonly logger = new Logger(GiveawayAdminAuthController.name);

  constructor(
    private readonly auth: GiveawayAdminAuthService,
    private readonly redis: GiveawayRedisService,
    @Inject(GIVEAWAY_CONFIG) private readonly config: GiveawayConfig,
  ) {}

  private async limit(req: Request, res: Response): Promise<void> {
    let retry: number;
    try {
      retry = await this.redis.hit(
        'admin-login',
        rateLimitKey(req.ip),
        ADMIN_LOGIN_PER_10MIN,
        600,
      );
    } catch {
      throw unavailable(res, 5);
    }
    if (retry > 0) throw tooManyRequests(res, retry);
  }

  @Get('login')
  async login(@Req() req: Request, @Res() res: Response): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');
    if (!isGiveawayOperational(this.config)) throw unavailable();
    await this.limit(req, res);
    if (!this.auth.isLoginOpen()) throw forbidden('admin_login_closed');
    let started: { url: string; binder: string };
    try {
      started = await this.auth.startLogin();
    } catch {
      this.logger.error('giveaway admin login start failed');
      throw unavailable(res, 5);
    }
    res.cookie(ADMIN_OAUTH_COOKIE, started.binder, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: ADMIN_OAUTH_COOKIE_PATH,
      maxAge: ADMIN_OAUTH_TTL_S * 1000,
    });
    res.redirect(302, started.url);
  }

  @Get('callback')
  async callback(
    @Req() req: Request,
    @Res() res: Response,
    @Query('code') code?: unknown,
    @Query('state') state?: unknown,
  ): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');
    if (!isGiveawayOperational(this.config)) throw unavailable();
    await this.limit(req, res);
    const base = this.config.admin.origin;
    const binder = readCookie(req.headers.cookie, ADMIN_OAUTH_COOKIE);
    res.clearCookie(ADMIN_OAUTH_COOKIE, { path: ADMIN_OAUTH_COOKIE_PATH });
    let result;
    try {
      result = await this.auth.finishLogin(
        typeof code === 'string' ? code : undefined,
        typeof state === 'string' ? state : undefined,
        binder,
      );
    } catch {
      this.logger.error('giveaway admin login failed');
      res.redirect(302, `${base}/?error=login_failed`);
      return;
    }
    if (!result.ok) {
      res.redirect(302, `${base}/?error=${result.error}`);
      return;
    }
    res.cookie(ADMIN_COOKIE, result.token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: ADMIN_COOKIE_PATH,
      maxAge: ADMIN_ABSOLUTE_MS,
    });
    res.redirect(302, `${base}/`);
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(GiveawayAdminGuard)
  async logout(
    @Req() req: AdminRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (req.giveawayAdmin !== undefined) {
      await this.auth.logout(req.giveawayAdmin);
    }
    res.clearCookie(ADMIN_COOKIE, { path: ADMIN_COOKIE_PATH });
    return { ok: true };
  }
}
