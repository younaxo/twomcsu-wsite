import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  avatar: string | null;
  value: number;
}

const LIMIT = 10;

/// Реальные рейтинги по уже существующим данным (PlayerStatistics —
/// пушится игровым сервером, coins начисляются через Voting, PHASE 14;
/// Achievement/Order — считаются по БД).
@Injectable()
export class LeaderboardsService {
  constructor(private readonly prisma: PrismaService) {}

  private async topByPlayerStatistics(
    field: 'playTime' | 'kills' | 'coins',
  ): Promise<LeaderboardEntry[]> {
    const rows = await this.prisma.playerStatistics.findMany({
      where: { [field]: { gt: 0 } },
      orderBy: { [field]: 'desc' },
      take: LIMIT,
      include: { user: { select: { id: true, username: true, avatar: true } } },
    });
    return rows.map((row, index) => ({
      rank: index + 1,
      userId: row.user.id,
      username: row.user.username,
      avatar: row.user.avatar,
      value: row[field],
    }));
  }

  private async topByAchievements(): Promise<LeaderboardEntry[]> {
    const grouped = await this.prisma.userAchievement.groupBy({
      by: ['userId'],
      where: { isCompleted: true },
      _count: { _all: true },
      orderBy: { _count: { userId: 'desc' } },
      take: LIMIT,
    });
    const users = await this.prisma.user.findMany({
      where: { id: { in: grouped.map((g) => g.userId) } },
      select: { id: true, username: true, avatar: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    const entries: LeaderboardEntry[] = [];
    grouped.forEach((g, index) => {
      const user = byId.get(g.userId);
      if (!user) return;
      entries.push({
        rank: index + 1,
        userId: user.id,
        username: user.username,
        avatar: user.avatar,
        value: g._count._all,
      });
    });
    return entries;
  }

  private async topByPurchases(): Promise<LeaderboardEntry[]> {
    const grouped = await this.prisma.order.groupBy({
      by: ['userId'],
      where: { status: OrderStatus.COMPLETED, userId: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { userId: 'desc' } },
      take: LIMIT,
    });
    const userIds = grouped
      .map((g) => g.userId)
      .filter((id): id is string => id !== null);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true, avatar: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    const entries: LeaderboardEntry[] = [];
    grouped.forEach((g, index) => {
      if (!g.userId) return;
      const user = byId.get(g.userId);
      if (!user) return;
      entries.push({
        rank: index + 1,
        userId: user.id,
        username: user.username,
        avatar: user.avatar,
        value: g._count._all,
      });
    });
    return entries;
  }

  async list() {
    const [playtime, kills, coins, achievements, purchases] = await Promise.all(
      [
        this.topByPlayerStatistics('playTime'),
        this.topByPlayerStatistics('kills'),
        this.topByPlayerStatistics('coins'),
        this.topByAchievements(),
        this.topByPurchases(),
      ],
    );
    return { playtime, kills, coins, achievements, purchases };
  }
}
