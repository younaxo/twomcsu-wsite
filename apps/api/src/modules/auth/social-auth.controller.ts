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
import { TelegramAuthDto } from './dto/telegram-auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';
import { REFRESH_COOKIE_NAME, refreshCookieOptions } from './refresh-cookie';
import {
  ExternalProvider,
  safeNextPath,
  SocialAuthService,
} from './social-auth.service';

const NONCE_COOKIE = 'social_nonce';

function requestContext(req: Request): RequestContext {
  return {
    ip: req.ip ?? req.socket.remoteAddress ?? 'unknown',
    userAgent: req.get('user-agent'),
  };
}

/// Код ошибки для редиректа на frontend (без текста исключения).
function errorCode(error: unknown, fallback: string): string {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (typeof response === 'object' && response && 'code' in response) {
      return String((response as { code: unknown }).code);
    }
    if (typeof response === 'object' && response && 'message' in response) {
      const message = (response as { message: unknown }).message;
      if (typeof message === 'string' && /^[a-z_]+$/.test(message))
        return message;
    }
  }
  return fallback;
}

/// Вход через Discord/Telegram и привязка аккаунтов (ADR-0069). Вход —
/// только по уже существующей привязке; привязка — только из своего профиля.
@Controller('auth')
@UseGuards(JwtAuthGuard)
export class SocialAuthController {
  constructor(
    private readonly social: SocialAuthService,
    private readonly config: ConfigService,
  ) {}

  private frontend(path: string): string {
    return `${this.config.get<string>('FRONTEND_URL', 'http://localhost:3000')}${path}`;
  }

  private nonceCookieOptions(): CookieOptions {
    const base = refreshCookieOptions(this.config, 10 * 60_000);
    return { ...base, path: '/auth' };
  }

  private setSession(res: Response, refreshToken: string, expiresAt: Date) {
    res.cookie(
      REFRESH_COOKIE_NAME,
      refreshToken,
      refreshCookieOptions(this.config, expiresAt.getTime() - Date.now()),
    );
  }

  @Public()
  @Get('social/providers')
  providers() {
    return this.social.providers();
  }

  // --- Discord -------------------------------------------------------------

  /// Вход: браузер переходит сюда со страницы /login.
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('discord/start')
  discordStart(@Query('next') next: string | undefined, @Res() res: Response) {
    const { state, nonce } = this.social.createState({
      mode: 'login',
      next: safeNextPath(next),
    });
    res.cookie(NONCE_COOKIE, nonce, this.nonceCookieOptions());
    res.redirect(HttpStatus.FOUND, this.social.discordAuthorizeUrl(state));
  }

  /// Привязка: только для вошедшего пользователя — URL с подписанным state,
  /// куда зашит его id (браузер затем переходит по URL).
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('discord/link-url')
  @HttpCode(HttpStatus.OK)
  discordLinkUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { state, nonce } = this.social.createState({
      mode: 'link',
      userId: user.id,
      next: '/settings/linked-accounts',
    });
    res.cookie(NONCE_COOKIE, nonce, this.nonceCookieOptions());
    return { url: this.social.discordAuthorizeUrl(state) };
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('discord/callback')
  async discordCallback(
    @Query('code') code: string | undefined,
    @Query('state') stateParam: string | undefined,
    @Query('error') oauthError: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    let mode: 'login' | 'link' = 'login';
    try {
      const state = this.social.verifyState(
        stateParam,
        req.cookies?.[NONCE_COOKIE],
      );
      mode = state.mode;
      res.clearCookie(NONCE_COOKIE, {
        ...this.nonceCookieOptions(),
        maxAge: undefined,
      });
      if (oauthError || !code) {
        throw new BadRequestException('discord_cancelled');
      }
      const profile = await this.social.exchangeDiscordCode(code);
      if (state.mode === 'link') {
        if (!state.userId) throw new BadRequestException('invalid_state');
        await this.social.link(state.userId, 'discord', profile);
        return res.redirect(
          HttpStatus.FOUND,
          this.frontend('/settings/linked-accounts?linked=discord'),
        );
      }
      const session = await this.social.loginWithExternal(
        'discord',
        profile,
        requestContext(req),
      );
      this.setSession(res, session.refreshToken, session.refreshTokenExpiresAt);
      return res.redirect(
        HttpStatus.FOUND,
        this.frontend(`/auth/complete?next=${encodeURIComponent(state.next)}`),
      );
    } catch (error) {
      const code = errorCode(error, 'discord_failed');
      const target =
        mode === 'link'
          ? `/settings/linked-accounts?link_error=${code}`
          : `/login?social_error=${code}`;
      return res.redirect(HttpStatus.FOUND, this.frontend(target));
    }
  }

  // --- Telegram ------------------------------------------------------------

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('telegram/login')
  @HttpCode(HttpStatus.OK)
  async telegramLogin(
    @Body() dto: TelegramAuthDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const profile = this.social.verifyTelegram(dto.payload);
    const session = await this.social.loginWithExternal(
      'telegram',
      profile,
      requestContext(req),
    );
    this.setSession(res, session.refreshToken, session.refreshTokenExpiresAt);
    return { user: session.user, accessToken: session.accessToken };
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('telegram/link')
  @HttpCode(HttpStatus.OK)
  async telegramLink(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: TelegramAuthDto,
  ) {
    const profile = this.social.verifyTelegram(dto.payload);
    await this.social.link(user.id, 'telegram', profile);
    return this.social.list(user.id);
  }

  // --- Связанные аккаунты -----------------------------------------------------

  @Get('linked-accounts')
  linked(@CurrentUser() user: AuthenticatedUser) {
    return this.social.list(user.id);
  }

  @Delete('linked-accounts/:provider')
  async unlink(
    @CurrentUser() user: AuthenticatedUser,
    @Param('provider') provider: string,
  ) {
    if (provider !== 'discord' && provider !== 'telegram') {
      throw new BadRequestException('Неизвестный провайдер');
    }
    await this.social.unlink(user.id, provider as ExternalProvider);
    return this.social.list(user.id);
  }
}
