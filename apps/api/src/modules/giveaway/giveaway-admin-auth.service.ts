import { createHash, randomBytes } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  GIVEAWAY_CONFIG,
  GiveawayConfig,
  isGiveawayOperational,
} from './giveaway.config';
import {
  ADMIN_ABSOLUTE_MS,
  ADMIN_IDLE_MS,
  ADMIN_OAUTH_TTL_S,
  SESSION_TOKEN_PATTERN,
} from './giveaway.constants';
import { GiveawayAdminAuditService } from './giveaway-admin-audit.service';
import {
  deriveLabelKey,
  hmacHex,
  safeEqualHex,
  sha256Hex,
} from './giveaway-crypto';
import { GiveawayDiscordClient } from './giveaway-discord.client';
import { GiveawayRedisService } from './giveaway-redis.service';

export interface AdminPrincipal {
  sessionId: string;
  discordId: string;
  discordName: string;
  expiresAt: Date;
}

export type LoginFailure =
  | 'login_closed'
  | 'state_invalid'
  | 'login_failed'
  | 'not_allowed'
  | 'mfa_required';

export type CallbackResult =
  { ok: true; token: string } | { ok: false; error: LoginFailure };

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

/// Вход администратора через Discord OAuth2 (ADR-G003 п. 2): code + PKCE +
/// state (одноразовый, Redis) + binder-cookie; сессия с хэшем токена в БД.
@Injectable()
export class GiveawayAdminAuthService {
  private readonly sessionKey: Buffer | null;
  private readonly csrfKey: Buffer | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: GiveawayRedisService,
    private readonly discord: GiveawayDiscordClient,
    private readonly audit: GiveawayAdminAuditService,
    @Inject(GIVEAWAY_CONFIG) private readonly config: GiveawayConfig,
  ) {
    const m = config.masterSecret;
    this.sessionKey = m === null ? null : deriveLabelKey(m, 'admin-session');
    this.csrfKey = m === null ? null : deriveLabelKey(m, 'admin-csrf');
  }

  /// Вход открыт, только если заданы allowlist, ключи Discord и секрет.
  isLoginOpen(): boolean {
    const a = this.config.admin;
    return (
      isGiveawayOperational(this.config) &&
      a.allowedDiscordIds.length > 0 &&
      a.discordClientId !== null &&
      a.discordClientSecret !== null &&
      a.discordRedirectUri !== null
    );
  }

  tokenHash(token: string): string {
    if (this.sessionKey === null) throw new Error('no key');
    return hmacHex(this.sessionKey, token);
  }

  csrfFor(token: string): string {
    if (this.csrfKey === null) throw new Error('no key');
    return hmacHex(this.csrfKey, token);
  }

  isCsrfValid(token: string, presented: string | undefined): boolean {
    if (presented === undefined || !/^[0-9a-f]{64}$/.test(presented)) {
      return false;
    }
    return safeEqualHex(this.csrfFor(token), presented);
  }

  /// URL Discord и binder для cookie.
  async startLogin(): Promise<{ url: string; binder: string }> {
    const state = b64url(randomBytes(32));
    const verifier = b64url(randomBytes(32));
    const binder = b64url(randomBytes(32));
    const challenge = b64url(createHash('sha256').update(verifier).digest());
    await this.redis.putOAuthState(
      sha256Hex(state),
      JSON.stringify({ verifier, binderHash: sha256Hex(binder) }),
      ADMIN_OAUTH_TTL_S,
    );
    return { url: this.discord.authorizeUrl(state, challenge), binder };
  }

  private async deny(
    error: LoginFailure,
    actor: string | null,
  ): Promise<CallbackResult> {
    await this.audit.recordSafe({
      actor,
      action: 'login_denied',
      detail: error,
    });
    return { ok: false, error };
  }

  async finishLogin(
    code: string | undefined,
    state: string | undefined,
    binder: string | null,
    now: Date = new Date(),
  ): Promise<CallbackResult> {
    if (!this.isLoginOpen()) return this.deny('login_closed', null);
    if (
      typeof code !== 'string' ||
      code.length === 0 ||
      code.length > 512 ||
      typeof state !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(state) ||
      binder === null
    ) {
      return this.deny('state_invalid', null);
    }
    // Состояние одноразовое: удаляется при первом чтении.
    const raw = await this.redis.takeOAuthState(sha256Hex(state));
    if (raw === null) return this.deny('state_invalid', null);
    let stored: { verifier: string; binderHash: string };
    try {
      stored = JSON.parse(raw) as { verifier: string; binderHash: string };
    } catch {
      return this.deny('state_invalid', null);
    }
    if (!safeEqualHex(stored.binderHash, sha256Hex(binder))) {
      return this.deny('state_invalid', null);
    }
    const accessToken = await this.discord.exchange(code, stored.verifier);
    if (accessToken === null) return this.deny('login_failed', null);
    const me = await this.discord.identify(accessToken);
    void this.discord.revoke(accessToken);
    if (me === null) return this.deny('login_failed', null);
    if (!this.config.admin.allowedDiscordIds.includes(me.id)) {
      return this.deny('not_allowed', me.id);
    }
    if (!me.mfaEnabled) return this.deny('mfa_required', me.id);

    const token = b64url(randomBytes(32));
    await this.prisma.giveawayAdminSession.create({
      data: {
        tokenHash: this.tokenHash(token),
        discordId: me.id,
        discordName: me.name,
        lastSeenAt: now,
        expiresAt: new Date(now.getTime() + ADMIN_ABSOLUTE_MS),
      },
    });
    await this.audit.record({ actor: me.id, action: 'login' });
    return { ok: true, token };
  }

  /// Сессия по токену из cookie или null: формат, отзыв, абсолютный срок,
  /// idle 30 минут, allowlist (проверяется на каждом запросе).
  async resolve(
    token: string | null,
    now: Date = new Date(),
  ): Promise<AdminPrincipal | null> {
    if (token === null || !SESSION_TOKEN_PATTERN.test(token)) return null;
    const row = await this.prisma.giveawayAdminSession.findUnique({
      where: { tokenHash: this.tokenHash(token) },
    });
    if (row === null || row.revokedAt !== null) return null;
    if (row.expiresAt.getTime() <= now.getTime()) return null;
    if (now.getTime() - row.lastSeenAt.getTime() > ADMIN_IDLE_MS) return null;
    if (!this.config.admin.allowedDiscordIds.includes(row.discordId)) {
      return null;
    }
    await this.prisma.giveawayAdminSession.updateMany({
      where: { id: row.id, revokedAt: null },
      data: { lastSeenAt: now },
    });
    return {
      sessionId: row.id,
      discordId: row.discordId,
      discordName: row.discordName,
      expiresAt: row.expiresAt,
    };
  }

  async logout(p: AdminPrincipal, now: Date = new Date()): Promise<void> {
    await this.prisma.giveawayAdminSession.updateMany({
      where: { id: p.sessionId, revokedAt: null },
      data: { revokedAt: now },
    });
    await this.audit.record({ actor: p.discordId, action: 'logout' });
  }
}
