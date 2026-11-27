import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { SkipAudit } from '../audit/skip-audit.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { InventoryMeQueryDto } from '../inventory/dto/inventory-query.dto';
import { RequirePermissions } from '../roles/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../roles/guards/permissions.guard';
import { AdminPlayersService } from './admin-players.service';

/// Инвентарь и статистика игрока для админов (Q116). PermissionsGuard
/// обеспечивает право и обязательную 2FA (Q22). Аудит пишет сервис.
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
  ) {
    res.setHeader('Cache-Control', 'private, no-store');
    return this.players.getInventory(admin.id, userId, query.server);
  }

  @Get(':userId/stats')
  @RequirePermissions('players.inventory.view')
  @SkipAudit()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async stats(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('userId') userId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'private, no-store');
    return this.players.getStats(admin.id, userId);
  }
}
