import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PROVIDERS, type ConnectedProvider } from './connected-providers';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService, RequestContext } from './auth.service';
import { IdTokenError, Jwk, verifyIdToken } from './oidc-jwt.util';

export type ExternalProvider = 'discord' | 'telegram';

export interface ExternalProfile {
  providerUserId: string;
  username: string | null;
  displayName: string | null;
}

export interface SocialState {
  mode: 'login' | 'link';
  /// Для link — кто привязывает (из access-токена на момент старта).
  userId?: string;
  /// Куда вернуть после входа (только внутренний путь).
  next: string;
  nonce: string;
  exp: number;
}

/// Итог привязки: новая привязка или этот же аккаунт уже был привязан.
export type LinkOutcome = 'linked' | 'already_linked';

const STATE_TTL_MS = 10 * 60_000;

/// Telegram Login — OpenID Connect (core.telegram.org/bots/telegram-login):
/// Authorization Code + PKCE (S256), id_token проверяется по JWKS.
export const TELEGRAM_OIDC = {
  issuer: 'https://oauth.telegram.org',
  authorize: 'https://oauth.telegram.org/auth',
  token: 'https://oauth.telegram.org/token',
  jwks: 'https://oauth.telegram.org/.well-known/jwks.json',
} as const;
const JWKS_TTL_MS = 60 * 60_000;

/// PKCE: verifier (43 символа base64url) и challenge = BASE64URL(SHA256).
export function createPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

/// Безопасный внутренний путь возврата: только `/…`, без `//` и схем.
export function safeNextPath(value: unknown, fallback = '/'): string {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//')
  ) {
    return fallback;
  }
  return value.length > 512 ? fallback : value;
}

/// Вход через Discord/Telegram (ADR-0069).
///
/// КРИТИЧЕСКОЕ ПРАВИЛО: внешний аккаунт — только способ войти в УЖЕ
/// существующий аккаунт twomc.su, который пользователь сам привязал в
/// профиле. Нет привязки → вход отклоняется. Никакого автосоздания
/// аккаунта и никакой автопривязки по нику/e-mail/отображаемому имени.
@Injectable()
export class SocialAuthService {
  private readonly logger = new Logger(SocialAuthService.name);
  private jwksCache: { keys: Jwk[]; fetchedAt: number } | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  // --- Конфигурация --------------------------------------------------------

  discordConfigured(): boolean {
    return (
      !!this.config.get<string>('DISCORD_CLIENT_ID') &&
      !!this.config.get<string>('DISCORD_CLIENT_SECRET')
    );
  }

  /// Client ID из BotFather (Login Widget → OpenID Connect) — id бота; если
  /// не задан явно, берётся из префикса токена бота.
  telegramClientId(): string {
    const explicit = this.config.get<string>('TELEGRAM_CLIENT_ID', '');
    if (explicit) return explicit;
    return (
      this.config.get<string>('TELEGRAM_BOT_TOKEN', '').split(':')[0] ?? ''
    );
  }

  telegramConfigured(): boolean {
    return (
      !!this.telegramClientId() &&
      !!this.config.get<string>('TELEGRAM_CLIENT_SECRET')
    );
  }

  /// Какие кнопки показывать (без секретов).
  /// Какие провайдеры можно привязать. VK и Steam — в реестре, но без
  /// интеграции (ADR-0095): всегда `enabled: false` — UI показывает «Скоро».
  providers() {
    return {
      discord: { enabled: this.discordConfigured() },
      telegram: { enabled: this.telegramConfigured() },
      vk: { enabled: PROVIDERS.vk.integration !== null },
      steam: { enabled: PROVIDERS.steam.integration !== null },
    };
  }

  // --- Подписанный state (CSRF + режим) --------------------------------------

  private stateKey(): Buffer {
    return createHmac(
      'sha256',
      this.config.get<string>('JWT_ACCESS_SECRET', ''),
    )
      .update('twomc.social-state.v1')
      .digest();
  }

  createState(input: Omit<SocialState, 'nonce' | 'exp'>): {
    state: string;
    nonce: string;
  } {
    const nonce = randomBytes(16).toString('hex');
    const body: SocialState = {
      ...input,
      nonce,
      exp: Date.now() + STATE_TTL_MS,
    };
    const encoded = Buffer.from(JSON.stringify(body)).toString('base64url');
    const sig = createHmac('sha256', this.stateKey())
      .update(encoded)
      .digest('base64url');
    return { state: `${encoded}.${sig}`, nonce };
  }

  verifyState(state: unknown, nonceCookie: unknown): SocialState {
    if (typeof state !== 'string' || !state.includes('.')) {
      throw new BadRequestException('invalid_state');
    }
    const [encoded, sig] = state.split('.');
    const expected = createHmac('sha256', this.stateKey())
      .update(encoded as string)
      .digest('base64url');
    const a = Buffer.from(sig ?? '');
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new BadRequestException('invalid_state');
    }
    const body = JSON.parse(
      Buffer.from(encoded as string, 'base64url').toString('utf8'),
    ) as SocialState;
    if (body.exp < Date.now()) {
      throw new BadRequestException('state_expired');
    }
    // Nonce из httpOnly-cookie привязывает callback к браузеру, начавшему вход.
    if (typeof nonceCookie !== 'string' || nonceCookie !== body.nonce) {
      throw new BadRequestException('invalid_state');
    }
    return body;
  }

  // --- Discord -------------------------------------------------------------

  discordAuthorizeUrl(state: string): string {
    if (!this.discordConfigured()) {
      throw new ServiceUnavailableException('discord_disabled');
    }
    const params = new URLSearchParams({
      client_id: this.config.get<string>('DISCORD_CLIENT_ID', ''),
      redirect_uri: this.config.get<string>('DISCORD_REDIRECT_URI', ''),
      response_type: 'code',
      scope: 'identify',
      state,
      prompt: 'none',
    });
    return `https://discord.com/oauth2/authorize?${params.toString()}`;
  }

  async exchangeDiscordCode(code: string): Promise<ExternalProfile> {
    const body = new URLSearchParams({
      client_id: this.config.get<string>('DISCORD_CLIENT_ID', ''),
      client_secret: this.config.get<string>('DISCORD_CLIENT_SECRET', ''),
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.config.get<string>('DISCORD_REDIRECT_URI', ''),
    });
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(8000),
    });
    if (!tokenRes.ok) {
      this.logger.warn(
        `Discord token exchange failed: HTTP ${tokenRes.status}`,
      );
      throw new BadRequestException('discord_exchange_failed');
    }
    const token = (await tokenRes.json()) as { access_token?: string };
    if (!token.access_token) {
      throw new BadRequestException('discord_exchange_failed');
    }
    const meRes = await fetch('https://discord.com/api/users/@me', {
      headers: { authorization: `Bearer ${token.access_token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!meRes.ok) {
      throw new BadRequestException('discord_profile_failed');
    }
    const me = (await meRes.json()) as {
      id: string;
      username?: string;
      global_name?: string | null;
    };
    return {
      providerUserId: String(me.id),
      username: me.username ?? null,
      displayName: me.global_name ?? null,
    };
  }

  // --- Telegram (OpenID Connect) ------------------------------------------

  telegramAuthorizeUrl(
    state: string,
    nonce: string,
    challenge: string,
  ): string {
    if (!this.telegramConfigured()) {
      throw new ServiceUnavailableException('telegram_disabled');
    }
    const params = new URLSearchParams({
      client_id: this.telegramClientId(),
      redirect_uri: this.config.get<string>('TELEGRAM_REDIRECT_URI', ''),
      response_type: 'code',
      scope: 'openid profile',
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    return `${TELEGRAM_OIDC.authorize}?${params.toString()}`;
  }

  private async telegramKeys(force = false): Promise<Jwk[]> {
    if (
      !force &&
      this.jwksCache &&
      Date.now() - this.jwksCache.fetchedAt < JWKS_TTL_MS
    ) {
      return this.jwksCache.keys;
    }
    const res = await fetch(TELEGRAM_OIDC.jwks, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      this.logger.warn(`Telegram JWKS: HTTP ${res.status}`);
      throw new BadRequestException('telegram_failed');
    }
    const body = (await res.json()) as { keys?: Jwk[] };
    const keys = Array.isArray(body.keys) ? body.keys : [];
    this.jwksCache = { keys, fetchedAt: Date.now() };
    return keys;
  }

  /// Обмен кода на токены (Basic client_id:client_secret + PKCE verifier) и
  /// проверка id_token: подпись по JWKS, iss, aud = client id, exp, nonce.
  async exchangeTelegramCode(
    code: string,
    verifier: string,
    nonce: string,
  ): Promise<ExternalProfile> {
    const clientId = this.telegramClientId();
    const secret = this.config.get<string>('TELEGRAM_CLIENT_SECRET', '');
    const basic = Buffer.from(`${clientId}:${secret}`).toString('base64');
    const tokenRes = await fetch(TELEGRAM_OIDC.token, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        authorization: `Basic ${basic}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.config.get<string>('TELEGRAM_REDIRECT_URI', ''),
        client_id: clientId,
        code_verifier: verifier,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!tokenRes.ok) {
      this.logger.warn(
        `Telegram token exchange failed: HTTP ${tokenRes.status}`,
      );
      throw new BadRequestException('telegram_failed');
    }
    const token = (await tokenRes.json()) as { id_token?: string };
    if (!token.id_token) {
      throw new BadRequestException('telegram_failed');
    }
    const expected = {
      issuer: TELEGRAM_OIDC.issuer,
      audience: clientId,
      nonce,
    };
    const claims = await this.verifyTelegramIdToken(token.id_token, expected);
    // `id` (scope profile) — числовой Telegram user id, тот же, что у привязок
    // через прежний виджет; `sub` — непрозрачный идентификатор.
    const telegramId = claims.id;
    if (typeof telegramId !== 'number' && typeof telegramId !== 'string') {
      throw new BadRequestException('telegram_failed');
    }
    return {
      providerUserId: String(telegramId),
      username:
        typeof claims.preferred_username === 'string'
          ? claims.preferred_username
          : null,
      displayName: typeof claims.name === 'string' ? claims.name : null,
    };
  }

  private async verifyTelegramIdToken(
    idToken: string,
    expected: { issuer: string; audience: string; nonce: string },
  ) {
    try {
      return verifyIdToken(idToken, await this.telegramKeys(), expected);
    } catch (error) {
      try {
        // Ротация ключей: один повтор со свежим JWKS.
        if (error instanceof IdTokenError && error.reason === 'unknown_key') {
          return verifyIdToken(
            idToken,
            await this.telegramKeys(true),
            expected,
          );
        }
        throw error;
      } catch (final) {
        const reason = final instanceof IdTokenError ? final.reason : 'invalid';
        this.logger.warn(`Telegram id_token rejected: ${reason}`);
        throw new BadRequestException('telegram_failed');
      }
    }
  }

  // --- Вход и привязка -----------------------------------------------------

  /// Вход ТОЛЬКО по существующей привязке. Нет привязки — 403 с кодом
  /// `<provider>_not_linked` (frontend показывает инструкцию).
  async loginWithExternal(
    provider: ExternalProvider,
    profile: ExternalProfile,
    context: RequestContext,
  ) {
    const link = await this.prisma.userExternalAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider,
          providerUserId: profile.providerUserId,
        },
      },
    });
    if (!link) {
      throw new ForbiddenException({
        code: `${provider}_not_linked`,
        message:
          provider === 'discord'
            ? 'Этот Discord-аккаунт не привязан к twomc.su.'
            : 'Этот Telegram-аккаунт не привязан к twomc.su.',
      });
    }
    const session = await this.auth.issueSessionForUser(link.userId, context);
    await this.prisma.userExternalAccount.update({
      where: { id: link.id },
      data: {
        lastLoginAt: new Date(),
        username: profile.username,
        displayName: profile.displayName,
      },
    });
    return session;
  }

  /// Привязка из профиля. Тот же внешний аккаунт уже у этого пользователя —
  /// `already_linked` (не ошибка); у другого пользователя — 409
  /// `external_taken`; у пользователя уже другой аккаунт этого сервиса — 409
  /// `provider_slot_taken`.
  async link(
    userId: string,
    provider: ExternalProvider,
    profile: ExternalProfile,
  ): Promise<LinkOutcome> {
    const taken = await this.prisma.userExternalAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider,
          providerUserId: profile.providerUserId,
        },
      },
    });
    if (taken && taken.userId !== userId) {
      throw new ConflictException({
        code: 'external_taken',
        message: 'Этот аккаунт уже привязан к другому пользователю twomc.su',
      });
    }
    if (taken) {
      return 'already_linked';
    }
    const existing = await this.prisma.userExternalAccount.findUnique({
      where: { userId_provider: { userId, provider } },
    });
    if (existing) {
      throw new ConflictException({
        code: 'provider_slot_taken',
        message:
          'К вашему аккаунту уже привязан другой аккаунт этого сервиса — сначала отвяжите его',
      });
    }
    const created = await this.prisma.userExternalAccount.create({
      data: {
        userId,
        provider,
        providerUserId: profile.providerUserId,
        username: profile.username,
        displayName: profile.displayName,
      },
    });
    await this.audit.log({
      actorId: userId,
      action: 'auth.external.link',
      targetType: 'UserExternalAccount',
      targetId: created.id,
      severity: 'warning',
      changes: { provider, username: profile.username },
    });
    return 'linked';
  }

  /// Показывать ли привязку в публичном профиле — отдельно по провайдеру.
  async setVisibility(
    userId: string,
    provider: ConnectedProvider,
    isPublic: boolean,
  ) {
    const existing = await this.prisma.userExternalAccount.findUnique({
      where: { userId_provider: { userId, provider } },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Аккаунт не привязан');
    }
    await this.prisma.userExternalAccount.update({
      where: { id: existing.id },
      data: { isPublic },
    });
    await this.audit.log({
      actorId: userId,
      action: 'auth.external.visibility',
      targetType: 'UserExternalAccount',
      targetId: existing.id,
      severity: 'info',
      changes: { provider, isPublic },
    });
    return this.list(userId);
  }

  async unlink(userId: string, provider: ConnectedProvider) {
    const existing = await this.prisma.userExternalAccount.findUnique({
      where: { userId_provider: { userId, provider } },
    });
    if (!existing) {
      throw new NotFoundException('Аккаунт не привязан');
    }
    await this.prisma.userExternalAccount.delete({
      where: { id: existing.id },
    });
    await this.audit.log({
      actorId: userId,
      action: 'auth.external.unlink',
      targetType: 'UserExternalAccount',
      targetId: existing.id,
      severity: 'warning',
      changes: { provider, username: existing.username },
    });
    return { success: true };
  }

  list(userId: string) {
    return this.prisma.userExternalAccount.findMany({
      where: { userId },
      select: {
        provider: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        isPublic: true,
        linkedAt: true,
        lastLoginAt: true,
      },
      orderBy: { linkedAt: 'asc' },
    });
  }
}
