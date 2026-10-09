import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService, RequestContext } from './auth.service';

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

/// Telegram Login Widget payload.
export interface TelegramAuthPayload {
  id: number | string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number | string;
  hash: string;
}

const STATE_TTL_MS = 10 * 60_000;
const TELEGRAM_MAX_AGE_S = 24 * 60 * 60;

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

  telegramConfigured(): boolean {
    return (
      !!this.config.get<string>('TELEGRAM_BOT_TOKEN') &&
      !!this.config.get<string>('TELEGRAM_BOT_USERNAME')
    );
  }

  /// Публичные сведения для кнопок входа (без секретов: id бота публичен).
  providers() {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN', '');
    return {
      discord: { enabled: this.discordConfigured() },
      telegram: {
        enabled: this.telegramConfigured(),
        botUsername: this.telegramConfigured()
          ? this.config.get<string>('TELEGRAM_BOT_USERNAME', '')
          : null,
        botId: this.telegramConfigured() ? token.split(':')[0] : null,
      },
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

  // --- Telegram ------------------------------------------------------------

  /// Проверка подписи Telegram Login Widget: secret = SHA256(bot_token),
  /// hash = HMAC_SHA256(data_check_string, secret); данные не старше суток.
  verifyTelegram(payload: TelegramAuthPayload): ExternalProfile {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN', '');
    if (!this.telegramConfigured()) {
      throw new ServiceUnavailableException('telegram_disabled');
    }
    if (!payload || typeof payload.hash !== 'string' || !payload.id) {
      throw new BadRequestException('telegram_invalid');
    }
    const fields = Object.entries(payload)
      .filter(
        ([key, value]) =>
          key !== 'hash' && value !== undefined && value !== null,
      )
      .map(([key, value]) => `${key}=${value}`)
      .sort();
    const secret = createHash('sha256').update(token).digest();
    const expected = createHmac('sha256', secret)
      .update(fields.join('\n'))
      .digest('hex');
    const a = Buffer.from(payload.hash);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new ForbiddenException({
        code: 'telegram_invalid',
        message: 'Подпись Telegram не прошла проверку',
      });
    }
    const age = Math.floor(Date.now() / 1000) - Number(payload.auth_date);
    if (!Number.isFinite(age) || age > TELEGRAM_MAX_AGE_S || age < -300) {
      throw new ForbiddenException({
        code: 'telegram_expired',
        message: 'Данные Telegram устарели — повторите вход',
      });
    }
    const name = [payload.first_name, payload.last_name]
      .filter(Boolean)
      .join(' ');
    return {
      providerUserId: String(payload.id),
      username: payload.username ?? null,
      displayName: name || null,
    };
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

  async link(
    userId: string,
    provider: ExternalProvider,
    profile: ExternalProfile,
  ) {
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
      return taken;
    }
    const existing = await this.prisma.userExternalAccount.findUnique({
      where: { userId_provider: { userId, provider } },
    });
    if (existing) {
      throw new ConflictException({
        code: 'already_linked',
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
    return created;
  }

  async unlink(userId: string, provider: ExternalProvider) {
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
        linkedAt: true,
        lastLoginAt: true,
      },
      orderBy: { linkedAt: 'asc' },
    });
  }
}
