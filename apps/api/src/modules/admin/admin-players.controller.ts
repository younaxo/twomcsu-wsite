import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { SkipAudit } from '../audit/skip-audit.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { InventoryMeQueryDto } from '../inventory/dto/inventory-query.dto';
import { RequirePermissions } from '../roles/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../roles/guards/permissions.guard';
import { normalizeIp } from '../../config/trust-proxy';
import {
  AdminPlayersService,
  type PlayerAuditMeta,
} from './admin-players.service';

/// IP (trust proxy) и User-Agent (до 255) для записи аудита.
function requestMeta(req: Request): PlayerAuditMeta {
  return {
    ipAddress: normalizeIp(req.ip ?? req.socket.remoteAddress),
    userAgent: req.get('user-agent')?.slice(0, 255) ?? undefined,
  };
}

/// Инвентарь и статистика игрока для админов (Q116). PermissionsGuard
/// обеспечивает право и обязательную 2FA (Q22). Аудит пишет сервис.
///
/// Одно право `players.inventory.view` закрывает оба просмотра (инвентарь и
/// статистику); в журнале они различаются действиями players.inventory.view и
/// players.stats.view. Маршруты читают только БД и от `BRIDGE_ENABLED` не
/// зависят: при выключенном приёме Bridge админ получает 200 с последним
/// сохранённым снимком (или `no_data`, если снимков нет). Так задумано.
@Controller('admin/players')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdminPlayersController {
  constructor(private readonly players: AdminPlayersService) {}

  @Get(':userId/inventory')
  @RequirePermissions('players.inventory.view')
  @SkipAudit()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async inventory(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('userId') userId: string,
    @Query() query: InventoryMeQueryDto,
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
  ) {
    res.setHeader('Cache-Control', 'private, no-store');
    return this.players.getInventory(
      admin.id,
      userId,
      query.server,
      requestMeta(req),
    );
  }

  @Get(':userId/stats')
  @RequirePermissions('players.inventory.view')
  @SkipAudit()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async stats(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('userId') userId: string,
    @Res({ passthrough: true }) res: Response,
    @Req() req: Request,
  ) {
    res.setHeader('Cache-Control', 'private, no-store');
    return this.players.getStats(admin.id, userId, requestMeta(req));
  }
}
