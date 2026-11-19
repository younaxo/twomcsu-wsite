import { randomBytes } from 'crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { normalizeIp, rateLimitKey } from '../../config/trust-proxy';
import { PrismaService } from '../prisma/prisma.service';
import { GIVEAWAY_CONFIG, GiveawayConfig } from './giveaway.config';
import {
  CODES_PER_IP_HOUR,
  CODES_PER_SESSION_10MIN,
  CODES_PER_SUBNET_HOUR,
  CODE_TTL_S,
  SESSION_TOKEN_PATTERN,
  STATUS_PER_SESSION_MIN,
} from './giveaway.constants';
import { formatCode, generateCode } from './giveaway-codes';
import { deriveLabelKey, hmacHex } from './giveaway-crypto';
import { GiveawayRedisService } from './giveaway-redis.service';
import { GiveawaySettingsService } from './giveaway-settings.service';

/// Токен проверки капчи (ADR-G002 п. 2.6). Провайдер необязателен: в
/// GIVEAWAY_ONLY CaptchaService недоступен.
export const GIVEAWAY_CAPTCHA_VERIFIER = Symbol('GIVEAWAY_CAPTCHA_VERIFIER');
export interface GiveawayCaptchaVerifier {
  verify(token: string | undefined, remoteIp?: string): Promise<boolean>;
}

export class GiveawayLimitError extends Error {
  constructor(
    readonly kind: 'rate_limited' | 'captcha_failed' | 'captcha_unavailable',
    readonly retryAfterS: number = 0,
  ) {
    super(kind);
  }
}

export type GiveawayCodeStatus =
  | { status: 'none' }
  | { status: 'pending'; expiresAt: string }
  | { status: 'redeemed'; ticket: string; playerName: string }
  | { status: 'expired' };

export type GiveawayPhase = 'before' | 'running' | 'finished';

/// Выдача кодов и статус для владельца сессии (ADR-G002 п. 1-5). В логи не
/// попадают коды, токены сессий и IP.
@Injectable()
export class GiveawayCodesService {
  private readonly sessionKey: Buffer | null;
  private readonly codeKey: Buffer | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: GiveawayRedisService,
    private readonly settings: GiveawaySettingsService,
    @Inject(GIVEAWAY_CONFIG) private readonly config: GiveawayConfig,
    @Optional()
    @Inject(GIVEAWAY_CAPTCHA_VERIFIER)
    private readonly captcha?: GiveawayCaptchaVerifier,
  ) {
    const m = config.masterSecret;
    this.sessionKey = m === null ? null : deriveLabelKey(m, 'session');
    this.codeKey = m === null ? null : deriveLabelKey(m, 'code');
  }

  /// Хэш нормализованного кода для хранения и сравнения.
  codeHash(normalized: string): string {
    if (this.codeKey === null) throw new Error('no key');
    return hmacHex(this.codeKey, normalized);
  }

  sessionHash(token: string): string {
    if (this.sessionKey === null) throw new Error('no key');
    return hmacHex(this.sessionKey, token);
  }

  static isValidToken(token: string | null | undefined): token is string {
    return typeof token === 'string' && SESSION_TOKEN_PATTERN.test(token);
  }

  static newSessionToken(): string {
    return randomBytes(32).toString('base64url');
  }

  async issue(
    token: string | null,
    ip: string | undefined,
    captchaToken: string | undefined,
    now: Date = new Date(),
  ): Promise<{
    code: string;
    expiresAt: Date;
    ttlSeconds: number;
    sessionToken: string;
    isNewSession: boolean;
  }> {
    if (this.config.captchaEnabled) {
      if (this.captcha === undefined) {
        throw new GiveawayLimitError('captcha_unavailable');
      }
      if (!(await this.captcha.verify(captchaToken, ip))) {
        throw new GiveawayLimitError('captcha_failed');
      }
    }
    const isNewSession = !GiveawayCodesService.isValidToken(token);
    const sessionToken = isNewSession
      ? GiveawayCodesService.newSessionToken()
      : (token as string);
    const sHash = this.sessionHash(sessionToken);

    const retry = Math.max(
      await this.redis.hit(
        'codes-net',
        rateLimitKey(ip),
        CODES_PER_SUBNET_HOUR,
        3600,
      ),
      await this.redis.hit(
        'codes-ip',
        normalizeIp(ip),
        CODES_PER_IP_HOUR,
        3600,
      ),
      await this.redis.hit('codes-sess', sHash, CODES_PER_SESSION_10MIN, 600),
    );
    if (retry > 0) throw new GiveawayLimitError('rate_limited', retry);
    if (!(await this.redis.acquireLock(sHash, 5))) {
      throw new GiveawayLimitError('rate_limited', 1);
    }
    try {
      const code = generateCode();
      const expiresAt = new Date(now.getTime() + CODE_TTL_S * 1000);
      await this.prisma.$transaction(async (tx) => {
        await tx.giveawayCode.updateMany({
          where: { sessionHash: sHash, redeemedAt: null, revokedAt: null },
          data: { revokedAt: now },
        });
        await tx.giveawayCode.create({
          data: {
            codeHash: this.codeHash(code),
            sessionHash: sHash,
            createdAt: now,
            expiresAt,
          },
        });
      });
      return {
        code: formatCode(code),
        expiresAt,
        ttlSeconds: CODE_TTL_S,
        sessionToken,
        isNewSession,
      };
    } finally {
      await this.redis.releaseLock(sHash);
    }
  }

  async status(
    token: string | null,
    now: Date = new Date(),
  ): Promise<GiveawayCodeStatus> {
    if (!GiveawayCodesService.isValidToken(token)) return { status: 'none' };
    const sHash = this.sessionHash(token);
    const retry = await this.redis.hit(
      'status-sess',
      sHash,
      STATUS_PER_SESSION_MIN,
      60,
    );
    if (retry > 0) throw new GiveawayLimitError('rate_limited', retry);
    const last = await this.prisma.giveawayCode.findFirst({
      where: { sessionHash: sHash },
      orderBy: { createdAt: 'desc' },
      include: { ticket: true },
    });
    if (last === null) return { status: 'none' };
    if (last.redeemedAt !== null && last.ticket !== null) {
      return {
        status: 'redeemed',
        ticket: last.ticket.ticket,
        playerName: last.ticket.playerName,
      };
    }
    if (
      last.revokedAt !== null ||
      last.redeemedAt !== null ||
      last.expiresAt.getTime() <= now.getTime()
    ) {
      return { status: 'expired' };
    }
    return { status: 'pending', expiresAt: last.expiresAt.toISOString() };
  }

  /// Публичный ход розыгрыша, без персональных данных (п. 5).
  async publicInfo(now: Date = new Date()) {
    const s = await this.settings.get();
    const issued = await this.prisma.giveawayTicket.count();
    const t = now.getTime();
    const status: GiveawayPhase =
      t < s.startAt.getTime()
        ? 'before'
        : t > s.cutoffAt.getTime()
          ? 'finished'
          : 'running';
    return { status, ...this.settings.describe(s), ticketsIssued: issued };
  }
}
