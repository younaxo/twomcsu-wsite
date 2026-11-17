import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { SkipAudit } from '../audit/skip-audit.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { RequirePermissions } from '../roles/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../roles/guards/permissions.guard';
import {
  PublicPunishmentListResponse,
  PublicPunishmentResponse,
} from './api/punishments-api.types';
import {
  PunishmentsErrorHeadersFilter,
  PunishmentsPublicEnabledGuard,
  sendPublic,
  setPrivateNoStore,
} from './punishments-http';
import {
  IssuerHideRequestMeta,
  PunishmentsIssuerHideService,
} from './punishments-issuer-hide.service';
import {
  HidePunishmentIssuerDto,
  MyPunishmentsQueryDto,
  PublicPunishmentsQueryDto,
  StaffPunishmentsQueryDto,
} from './punishments-query.dto';
import { PunishmentsReadService } from './punishments-read.service';

/// Контроллеры зеркала игровых наказаний (ADR-0180, раздел 2). Имя
/// `PunishmentsController` занято модулем reports (наказания САЙТА).

/// Публичный список и карточка: без входа и без прав (Q63 п.6).
@Controller('punishments/public')
@UseFilters(PunishmentsErrorHeadersFilter)
@UseGuards(PunishmentsPublicEnabledGuard)
export class MinecraftPunishmentsPublicController {
  constructor(private readonly punishments: PunishmentsReadService) {}

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get()
  async list(
    @Query() query: PublicPunishmentsQueryDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PublicPunishmentListResponse | undefined> {
    return sendPublic(req, res, await this.punishments.listPublic(query));
  }

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get(':ref')
  async card(
    @Param('ref') ref: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PublicPunishmentResponse | undefined> {
    return sendPublic(req, res, await this.punishments.getPublic(ref));
  }
}

/// «Наказания на сервере» игрока: только по подтверждённой привязке.
@Controller('punishments/me')
@UseFilters(PunishmentsErrorHeadersFilter)
export class MinecraftPunishmentsMeController {
  constructor(private readonly punishments: PunishmentsReadService) {}

  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MyPunishmentsQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    setPrivateNoStore(res);
    return this.punishments.listMine(user.id, query);
  }
}

/// IP и User-Agent для аудита скрытия выдавшего (как в AuditInterceptor).
function requestMeta(req: Request): IssuerHideRequestMeta {
  return {
    ipAddress: req.ip,
    userAgent: req.get('user-agent') ?? undefined,
  };
}

/// Персонал: право `users.punishments` + обязательная 2FA через
/// `PermissionsGuard` (ADR-0109, ADR-0169). Маршрут `status` - до `:ref`.
@Controller('admin/punishments')
@UseFilters(PunishmentsErrorHeadersFilter)
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MinecraftPunishmentsAdminController {
  constructor(
    private readonly punishments: PunishmentsReadService,
    private readonly issuerHide: PunishmentsIssuerHideService,
  ) {}

  @RequirePermissions('users.punishments')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Get()
  async list(
    @Query() query: StaffPunishmentsQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    setPrivateNoStore(res);
    return this.punishments.listStaff(query);
  }

  @RequirePermissions('users.punishments')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Get('status')
  async status(@Res({ passthrough: true }) res: Response) {
    setPrivateNoStore(res);
    return this.punishments.adminStatus();
  }

  @RequirePermissions('users.punishments')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Get(':ref')
  async card(
    @Param('ref') ref: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    setPrivateNoStore(res);
    return this.punishments.staffCard(user.id, ref);
  }

  /// Аудит пишет сервис в той же транзакции: общий AuditInterceptor отключён.
  /// Нужны ОБА права (fail-closed): ответ отдаёт полную карточку персонала,
  /// иначе обход аудита `punishment.card.view` (Low-1, ADR-0180).
  @SkipAudit()
  @RequirePermissions('punishments.issuer.hide', 'users.punishments')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(200)
  @Post(':ref/issuer-hidden')
  async hideIssuer(
    @Param('ref') ref: string,
    @Body() body: HidePunishmentIssuerDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    setPrivateNoStore(res);
    return this.issuerHide.hide(user.id, ref, body.reason, requestMeta(req));
  }

  @SkipAudit()
  @RequirePermissions('punishments.issuer.hide', 'users.punishments')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Delete(':ref/issuer-hidden')
  async unhideIssuer(
    @Param('ref') ref: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    setPrivateNoStore(res);
    return this.issuerHide.unhide(user.id, ref, requestMeta(req));
  }
}
