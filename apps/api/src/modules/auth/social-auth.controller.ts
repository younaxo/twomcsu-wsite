import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { RequestContext } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';
import {
  REFRESH_COOKIE_NAME,
  TWO_FACTOR_COOKIE_NAME,
  refreshCookieOptions,
  twoFactorCookieOptions,
} from './refresh-cookie';
import {
  createPkce,
  ExternalProvider,
  safeNextPath,
  SocialAuthService,
  SocialState,
} from './social-auth.service';
import {
  isConnectedProvider,
  type ConnectedProvider,
} from './connected-providers';
import { LinkedAccountVisibilityDto } from './dto/linked-account-visibility.dto';

const NONCE_COOKIE = 'social_nonce';
const PKCE_COOKIE = 'social_pkce';
const LINK_NEXT = '/settings/linked-accounts';

/// Итог входа/привязки для страницы результата на frontend. В URL — только
/// провайдер, режим, статус и внутренний путь возврата: никаких токенов,
/// кодов, секретов и ответов провайдера.
export type SocialResultStatus =
  | 'success'
  | 'linked'
  | 'already_linked'
  | 'not_linked'
  | 'taken'
  | 'slot_taken'
  | 'cancelled'
  | 'expired'
  | 'unavailable'
  /// Включена 2FA: нужен код (челлендж — в httpOnly cookie, ADR-0109).
  | 'two_factor'
  | 'error';

function requestContext(req: Request): RequestContext {
  return {
    ip: req.ip ?? req.socket.remoteAddress ?? 'unknown',
    userAgent: req.get('user-agent'),
  };
}

/// Код исключения (без текста) → статус результата.
export function resultStatus(error: unknown): SocialResultStatus {
  let code = '';
  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (typeof response === 'object' && response && 'code' in response) {
      code = String((response as { code: unknown }).code);
    } else if (
      typeof response === 'object' &&
      response &&
      'message' in response
    ) {
      code = String((response as { message: unknown }).message);
    }
  }
  if (code.endsWith('_not_linked')) return 'not_linked';
  switch (code) {
    case 'external_taken':
      return 'taken';
    case 'provider_slot_taken':
      return 'slot_taken';
    case 'invalid_state':
    case 'state_expired':
      return 'expired';
    case 'cancelled':
      return 'cancelled';
    case 'discord_disabled':
    case 'telegram_disabled':
      return 'unavailable';
    default:
      return 'error';
  }
}

/// Режим из state без проверки подписи — только чтобы показать правильный
/// экран результата, если сам state отклонён (действий по нему не выполняется).
function modeHint(state: unknown): 'login' | 'link' {
  if (typeof state !== 'string') return 'login';
  try {
    const body = JSON.parse(
      Buffer.from(state.split('.')[0] ?? '', 'base64url').toString('utf8'),
    ) as { mode?: unknown };
    return body.mode === 'link' ? 'link' : 'login';
  } catch {
    return 'login';
  }
}

/// Вход через Discord/Telegram и привязка аккаунтов (ADR-0069, ADR-0071).
/// Вход — только по уже существующей привязке; привязка — только из своего
/// профиля. Режим login/link зашит в подписанный state.
@Controller('auth')
@UseGuards(JwtAuthGuard)
export class SocialAuthController {
  constructor(
    private readonly social: SocialAuthService,
    private readonly config: ConfigService,
  ) {}

  private resultUrl(
    provider: ExternalProvider,
    mode: 'login' | 'link',
    status: SocialResultStatus,
    next?: string,
  ): string {
    const params = new URLSearchParams({ provider, mode, status });
    if (next && next !== '/') params.set('next', next);
    const base = this.config.get<string>(
      'FRONTEND_URL',
      'http://localhost:3000',
    );
    return `${base}/auth/result?${params.toString()}`;
  }

  private shortCookie(): CookieOptions {
    const base = refreshCookieOptions(this.config, 10 * 60_000);
    return { ...base, path: '/auth' };
  }

  private clearFlowCookies(res: Response) {
    const options = { ...this.shortCookie(), maxAge: undefined };
    res.clearCookie(NONCE_COOKIE, options);
    res.clearCookie(PKCE_COOKIE, options);
  }

  /// Подписанный state + nonce-cookie (и PKCE verifier для Telegram) → URL
  /// авторизации провайдера.
  private beginFlow(
    provider: ExternalProvider,
    input: Omit<SocialState, 'nonce' | 'exp'>,
    res: Response,
  ): string {
    const { state, nonce } = this.social.createState(input);
    if (provider === 'discord') {
      const url = this.social.discordAuthorizeUrl(state);
      res.cookie(NONCE_COOKIE, nonce, this.shortCookie());
      return url;
    }
    const pkce = createPkce();
    const url = this.social.telegramAuthorizeUrl(state, nonce, pkce.challenge);
    res.cookie(NONCE_COOKIE, nonce, this.shortCookie());
    res.cookie(PKCE_COOKIE, pkce.verifier, this.shortCookie());
    return url;
  }

  private async finishFlow(
    provider: ExternalProvider,
    query: { code?: string; state?: string; error?: string },
    req: Request,
    res: Response,
  ) {
    let mode = modeHint(query.state);
    let next = mode === 'link' ? LINK_NEXT : '/';
    try {
      const state = this.social.verifyState(
        query.state,
        req.cookies?.[NONCE_COOKIE],
      );
      mode = state.mode;
      next = state.mode === 'link' ? LINK_NEXT : safeNextPath(state.next);
      const verifier = req.cookies?.[PKCE_COOKIE];
      this.clearFlowCookies(res);
      if (query.error === 'access_denied' || (!query.error && !query.code)) {
        throw new BadRequestException('cancelled');
      }
      if (query.error || !query.code) {
        throw new BadRequestException(`${provider}_failed`);
      }
      const profile =
        provider === 'discord'
          ? await this.social.exchangeDiscordCode(query.code)
          : await this.social.exchangeTelegramCode(
              query.code,
              typeof verifier === 'string' ? verifier : '',
              state.nonce,
            );
      if (state.mode === 'link') {
        if (!state.userId) throw new BadRequestException('invalid_state');
        const outcome = await this.social.link(state.userId, provider, profile);
        return res.redirect(
          HttpStatus.FOUND,
          this.resultUrl(provider, 'link', outcome, next),
        );
      }
      const session = await this.social.loginWithExternal(
        provider,
        profile,
        requestContext(req),
      );
      if ('twoFactorChallenge' in session) {
        res.cookie(
          TWO_FACTOR_COOKIE_NAME,
          session.twoFactorChallenge,
          twoFactorCookieOptions(this.config),
        );
        return res.redirect(
          HttpStatus.FOUND,
          this.resultUrl(provider, 'login', 'two_factor', next),
        );
      }
      res.cookie(
        REFRESH_COOKIE_NAME,
        session.refreshToken,
        refreshCookieOptions(
          this.config,
          session.refreshTokenExpiresAt.getTime() - Date.now(),
        ),
      );
      return res.redirect(
        HttpStatus.FOUND,
        this.resultUrl(provider, 'login', 'success', next),
      );
    } catch (error) {
      return res.redirect(
        HttpStatus.FOUND,
        this.resultUrl(provider, mode, resultStatus(error), next),
      );
    }
  }

  /// Любой провайдер реестра (для списка, видимости и отвязки).
  private parseConnected(value: string): ConnectedProvider {
    if (!isConnectedProvider(value)) {
      throw new BadRequestException('Неизвестный провайдер');
    }
    return value;
  }

  private parseProvider(value: string): ExternalProvider {
    if (value !== 'discord' && value !== 'telegram') {
      throw new BadRequestException('Неизвестный провайдер');
    }
    return value;
  }

  @Public()
  @Get('social/providers')
  providers() {
    return this.social.providers();
  }

  /// Вход: браузер переходит сюда со страницы /login. Провайдер не настроен —
  /// сразу экран результата, а не JSON-ошибка.
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get(':provider/start')
  start(
    @Param('provider') providerParam: string,
    @Query('next') next: string | undefined,
    @Res() res: Response,
  ) {
    const provider = this.parseProvider(providerParam);
    const target = safeNextPath(next);
    try {
      const url = this.beginFlow(
        provider,
        { mode: 'login', next: target },
        res,
      );
      return res.redirect(HttpStatus.FOUND, url);
    } catch (error) {
      return res.redirect(
        HttpStatus.FOUND,
        this.resultUrl(provider, 'login', resultStatus(error), target),
      );
    }
  }

  /// Привязка: только для вошедшего пользователя — URL с подписанным state,
  /// куда зашит его id (браузер затем переходит по URL).
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':provider/link-url')
  @HttpCode(HttpStatus.OK)
  linkUrl(
    @Param('provider') providerParam: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const provider = this.parseProvider(providerParam);
    const url = this.beginFlow(
      provider,
      { mode: 'link', userId: user.id, next: LINK_NEXT },
      res,
    );
    return { url };
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get(':provider/callback')
  callback(
    @Param('provider') providerParam: string,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const provider = this.parseProvider(providerParam);
    return this.finishFlow(provider, { code, state, error }, req, res);
  }

  // --- Связанные аккаунты -----------------------------------------------------

  @Get('linked-accounts')
  linked(@CurrentUser() user: AuthenticatedUser) {
    return this.social.list(user.id);
  }

  @Patch('linked-accounts/:provider')
  visibility(
    @CurrentUser() user: AuthenticatedUser,
    @Param('provider') providerParam: string,
    @Body() dto: LinkedAccountVisibilityDto,
  ) {
    return this.social.setVisibility(
      user.id,
      this.parseConnected(providerParam),
      dto.isPublic,
    );
  }

  @Delete('linked-accounts/:provider')
  async unlink(
    @CurrentUser() user: AuthenticatedUser,
    @Param('provider') providerParam: string,
  ) {
    const provider = this.parseConnected(providerParam);
    await this.social.unlink(user.id, provider);
    return this.social.list(user.id);
  }
}
