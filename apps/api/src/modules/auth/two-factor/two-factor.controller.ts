import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { normalizeIp } from '../../../config/trust-proxy';
import { CurrentUser } from '../decorators/current-user.decorator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import { TwoFactorCodeDto, TwoFactorDisableDto } from './two-factor.dto';
import { TwoFactorAuditContext, TwoFactorService } from './two-factor.service';

/// IP — с учётом trust proxy (req.ip), как в остальных security-записях.
function auditContext(req: Request): TwoFactorAuditContext {
  return {
    ip: normalizeIp(req.ip ?? req.socket.remoteAddress),
    userAgent: req.get('user-agent')?.slice(0, 255) ?? undefined,
  };
}

/// Управление 2FA своего аккаунта (ADR-0109): статус, настройка с QR,
/// включение первым кодом, отключение паролем + кодом, новые резервные коды.
/// Включение, выключение и перевыпуск кодов пишутся в журнал аудита.
@Controller('auth/2fa')
@UseGuards(JwtAuthGuard)
export class TwoFactorController {
  constructor(private readonly twoFactor: TwoFactorService) {}

  @Get()
  async status(@CurrentUser() user: AuthenticatedUser) {
    return this.twoFactor.status(user.id);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('setup')
  async setup(@CurrentUser() user: AuthenticatedUser) {
    return this.twoFactor.setup(user.id);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('enable')
  async enable(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: TwoFactorCodeDto,
    @Req() req: Request,
  ) {
    return this.twoFactor.enable(user.id, dto.code, auditContext(req));
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('disable')
  async disable(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: TwoFactorDisableDto,
    @Req() req: Request,
  ) {
    await this.twoFactor.disable(
      user.id,
      dto.password,
      dto.code,
      auditContext(req),
    );
    return { success: true };
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('backup-codes')
  async regenerate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: TwoFactorCodeDto,
    @Req() req: Request,
  ) {
    return this.twoFactor.regenerateBackupCodes(
      user.id,
      dto.code,
      auditContext(req),
    );
  }
}
