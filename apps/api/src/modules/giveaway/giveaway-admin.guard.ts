import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { rateLimitKey } from '../../config/trust-proxy';
import {
  GIVEAWAY_CONFIG,
  GiveawayConfig,
  isGiveawayOperational,
} from './giveaway.config';
import {
  ADMIN_API_PER_MIN,
  ADMIN_COOKIE,
  ADMIN_CSRF_HEADER,
} from './giveaway.constants';
import { GiveawayAdminAuditService } from './giveaway-admin-audit.service';
import {
  AdminPrincipal,
  GiveawayAdminAuthService,
} from './giveaway-admin-auth.service';
import {
  forbidden,
  tooManyRequests,
  unauthorized,
  unavailable,
} from './giveaway-errors';
import { GiveawayRedisService } from './giveaway-redis.service';
import { readCookie } from './giveaway-public.controller';

export type AdminRequest = Request & {
  giveawayAdmin?: AdminPrincipal;
  giveawayAdminToken?: string;
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/// Охрана админ-API (ADR-G003 п. 2.5-2.6): лимит по адресу, сессия из cookie,
/// для изменяющих запросов - точный Origin и CSRF-заголовок. Тела ошибок без
/// деталей; токены и адреса не логируются.
@Injectable()
export class GiveawayAdminGuard implements CanActivate {
  constructor(
    private readonly auth: GiveawayAdminAuthService,
    private readonly redis: GiveawayRedisService,
    private readonly audit: GiveawayAdminAuditService,
    @Inject(GIVEAWAY_CONFIG) private readonly config: GiveawayConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const req = http.getRequest<AdminRequest>();
    const res = http.getResponse<Response>();
    res.setHeader('Cache-Control', 'no-store');
    if (!isGiveawayOperational(this.config)) throw unavailable();

    let retry: number;
    try {
      retry = await this.redis.hit(
        'admin-api',
        rateLimitKey(req.ip),
        ADMIN_API_PER_MIN,
        60,
      );
    } catch {
      throw unavailable(res, 5);
    }
    if (retry > 0) throw tooManyRequests(res, retry);

    const token = readCookie(req.headers.cookie, ADMIN_COOKIE);
    let principal: AdminPrincipal | null;
    try {
      principal = await this.auth.resolve(token);
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw unavailable(res, 5);
    }
    if (principal === null || token === null) throw unauthorized();

    if (!SAFE_METHODS.has(req.method.toUpperCase())) {
      const origin = req.headers.origin;
      const csrfHeader = req.headers[ADMIN_CSRF_HEADER];
      const csrf = typeof csrfHeader === 'string' ? csrfHeader : undefined;
      if (
        origin !== this.config.admin.origin ||
        !this.auth.isCsrfValid(token, csrf)
      ) {
        await this.audit.recordSafe({
          actor: principal.discordId,
          action: 'csrf_denied',
        });
        throw forbidden('csrf');
      }
    }
    req.giveawayAdmin = principal;
    req.giveawayAdminToken = token;
    return true;
  }
}
