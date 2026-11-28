import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import {
  InventoryService,
  type InventoryAdminResponseDto,
} from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';

export interface PlayerAuditMeta {
  ipAddress?: string;
  userAgent?: string;
}

export interface AdminPlayerStatsDto {
  /// `no_data` - записи статистики у игрока нет.
  state: 'ok' | 'no_data';
  stats: {
    playTimeMinutes: number;
    kills: number;
    deaths: number;
    hits: number;
    killDeathRatio: number;
    lastServer: string | null;
    updatedAt: string;
  } | null;
  viewer: { relation: 'admin' };
}

/// Админский просмотр инвентаря и статистики игрока (Q116). Только чтение;
/// каждый просмотр пишет запись аудита (кто, чей userId) БЕЗ содержимого.
/// Право на оба просмотра одно (`players.inventory.view`); действия аудита:
/// `players.inventory.view` и `players.stats.view`.
@Injectable()
export class AdminPlayersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly audit: AuditService,
  ) {}

  async getInventory(
    actorId: string,
    userId: string,
    server?: string,
    meta: PlayerAuditMeta = {},
  ): Promise<InventoryAdminResponseDto> {
    await this.assertUser(userId);
    const body = await this.inventory.getForAdmin(userId, server);
    await this.record(actorId, userId, 'players.inventory.view', meta);
    return body;
  }

  async getStats(
    actorId: string,
    userId: string,
    meta: PlayerAuditMeta = {},
  ): Promise<AdminPlayerStatsDto> {
    await this.assertUser(userId);
    const row = await this.prisma.playerStatistics.findUnique({
      where: { userId },
    });
    await this.record(actorId, userId, 'players.stats.view', meta);
    return {
      state: row ? 'ok' : 'no_data',
      stats: row
        ? {
            playTimeMinutes: row.playTime,
            kills: row.kills,
            deaths: row.deaths,
            hits: row.hits,
            killDeathRatio: row.killDeathRatio,
            lastServer: row.lastServer,
            updatedAt: row.updatedAt.toISOString(),
          }
        : null,
      viewer: { relation: 'admin' },
    };
  }

  private async assertUser(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException({ code: 'not_found', message: 'Не найдено' });
    }
  }

  /// strict: нет записи аудита - нет выдачи данных.
  private record(
    actorId: string,
    userId: string,
    action: string,
    meta: PlayerAuditMeta,
  ) {
    return this.audit.log({
      actorId,
      action,
      targetType: 'user',
      targetId: userId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent?.slice(0, 255),
      strict: true,
    });
  }
}
