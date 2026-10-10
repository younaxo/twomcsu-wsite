import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { PermissionService } from '../roles/permission.service';
import { AuthService, RequestContext } from './auth.service';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import {
  RegisterCompleteDto,
  RegisterMinecraftCodeDto,
  RegisterMinecraftDto,
  RegisterResendDto,
  RegisterStartDto,
  RegisterStateDto,
  RegisterVerifyDto,
} from './dto/registration.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';
import { REFRESH_COOKIE_NAME, refreshCookieOptions } from './refresh-cookie';
import { RegistrationService } from './registration.service';
import { StorageService } from '../files/storage.service';

function requestContext(req: Request): RequestContext {
  return {
    ip: req.ip ?? req.socket.remoteAddress ?? 'unknown',
    userAgent: req.get('user-agent'),
  };
}

@Controller('auth')
@UseGuards(JwtAuthGuard)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly permissions: PermissionService,
    private readonly config: ConfigService,
    private readonly registration: RegistrationService,
    private readonly storage: StorageService,
  ) {}

  @Public()
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  // --- Регистрация с подтверждением почты (ADR-0070) -------------------------

  // IP-лимит + Turnstile + не больше 5 кодов на e-mail в час (сервис).
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('register/start')
  registerStart(@Body() dto: RegisterStartDto, @Req() req: Request) {
    return this.registration.start(dto, requestContext(req));
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('register/resend')
  registerResend(@Body() dto: RegisterResendDto) {
    return this.registration.resend(dto);
  }

  // Перебор кода ограничен 5 попытками на запрос подтверждения (сервис).
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('register/verify')
  registerVerify(@Body() dto: RegisterVerifyDto) {
    return this.registration.verify(dto);
  }

  /// Состояние регистрации (продолжение после перезагрузки; без пароля).
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('register/state')
  registerState(@Body() dto: RegisterStateDto) {
    return this.registration.state(dto);
  }

  /// Привязка Minecraft (ADR-0072): 15-символьный код → 5-символьный код.
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('register/minecraft/code')
  registerMinecraftCode(@Body() dto: RegisterMinecraftCodeDto) {
    return this.registration.submitMinecraftCode(dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('register/minecraft/challenge')
  registerMinecraftChallenge(@Body() dto: RegisterMinecraftDto) {
    return this.registration.renewMinecraftChallenge(dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register/complete')
  async registerComplete(
    @Body() dto: RegisterCompleteDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.registration.complete(dto, requestContext(req));
    res.cookie(
      REFRESH_COOKIE_NAME,
      result.refreshToken,
      refreshCookieOptions(
        this.config,
        result.refreshTokenExpiresAt.getTime() - Date.now(),
      ),
    );
    return { user: result.user, accessToken: result.accessToken };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto, requestContext(req));
    res.cookie(
      REFRESH_COOKIE_NAME,
      result.refreshToken,
      refreshCookieOptions(
        this.config,
        result.refreshTokenExpiresAt.getTime() - Date.now(),
      ),
    );
    return { user: result.user, accessToken: result.accessToken };
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.refresh(
      req.cookies?.[REFRESH_COOKIE_NAME],
      requestContext(req),
    );
    res.cookie(
      REFRESH_COOKIE_NAME,
      result.refreshToken,
      refreshCookieOptions(
        this.config,
        result.refreshTokenExpiresAt.getTime() - Date.now(),
      ),
    );
    return { user: result.user, accessToken: result.accessToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(req.cookies?.[REFRESH_COOKIE_NAME]);
    res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions(this.config));
    return { success: true };
  }

  @Get('sessions')
  async sessions(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.listSessions(user.id);
  }

  @Delete('sessions')
  async logoutAll(@CurrentUser() user: AuthenticatedUser) {
    await this.authService.revokeAllSessions(user.id);
    return { success: true };
  }

  @Delete('sessions/:id')
  async revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.authService.revokeSession(user.id, id);
    return { success: true };
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ) {
    await this.authService.changePassword(user.id, dto);
    return { success: true };
  }

  /// Единственный источник effective permissions для frontend
  /// (44-TARGET-ARCHITECTURE.md §2: «frontend-меню строится из permissions,
  /// endpoint GET /auth/me возвращает effective permissions»). Frontend
  /// использует их только для UX (скрыть разделы/кнопки) — каждый API-вызов
  /// независимо проверяется PermissionsGuard на backend.
  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    const [fullUser, effective] = await Promise.all([
      this.authService.getMe(user.id),
      this.permissions.getEffectivePermissions(user.id),
    ]);
    return {
      id: fullUser.id,
      shortId: fullUser.shortId,
      tag: fullUser.tag,
      email: fullUser.email,
      username: fullUser.username,
      // Готовые URL (ADR-0088) — шапка и mini-profile показывают свой аватар
      // и баннер сразу, без отдельного запроса профиля.
      avatar: this.storage.publicUrl(fullUser.avatar),
      banner: this.storage.publicUrl(fullUser.banner),
      accessLevel: fullUser.accessLevel,
      accountType: fullUser.accountType,
      mustChangePassword: fullUser.mustChangePassword,
      roles: fullUser.roles.map(({ role }) => ({
        id: role.id,
        name: role.name,
        slug: role.slug,
        displayName: role.displayName,
        color: role.color,
        priority: role.priority,
        isSuperuser: role.isSuperuser,
      })),
      permissions: {
        superuser: effective.superuser,
        permissions: effective.permissions,
        // -Infinity не сериализуется в JSON (становится null) — отдаём null явно.
        maxPriority: Number.isFinite(effective.maxPriority)
          ? effective.maxPriority
          : null,
      },
    };
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto);
    return { success: true };
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto);
    return { success: true };
  }
}
