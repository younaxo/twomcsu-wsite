import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { StorageService } from '../files/storage.service';
import { TtlCache } from './ttl-cache';
import { StatsSettingsService } from './stats-settings.service';
import { PrismaService } from '../prisma/prisma.service';

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  avatar: string | null;
  value: number;
}

const LIMIT = 10;

/// Время жизни кэша рейтингов. Дольше устаревшим кэш быть не может; приватность
/// профиля сбрасывает его сразу (invalidate).
export const LEADERBOARDS_CACHE_TTL_MS = 30_000;

export type BoardKey =
  'playtime' | 'kills' | 'coins' | 'achievements' | 'purchases';

/// Рейтинги, которые наружу НЕ отдаются (решение владельца Q66: «Покупки»
/// скрыты до запуска оплаты). Загрузчик остаётся в коде, но не вызывается ни
/// из API, ни из кэша.
export const HIDDEN_BOARDS: readonly BoardKey[] = ['purchases'];

export type PublicBoardKey = Exclude<BoardKey, 'purchases'>;

export type PublicLeaderboards = Record<PublicBoardKey, LeaderboardEntry[]> & {
  enabled: boolean;
};

/// Кто может быть в публичном рейтинге (ADR-0127): профиль открыт всем,
/// статистика не скрыта владельцем (`hideStatistics`), не забанен, не
/// системный аккаунт. Места считаются после фильтра — без «дыр».
const RANKED_USER: Prisma.UserWhereInput = {
  isBanned: false,
  accountType: { not: 'SYSTEM' },
  profileVisibility: 'EVERYONE',
  hideStatistics: false,
};

/// Реальные рейтинги по уже существующим данным (PlayerStatistics —
/// пушится игровым сервером, coins начисляются через Voting, PHASE 14;
/// Achievement/Order — считаются по БД).
@Injectable()
export class LeaderboardsService {
  private readonly cache = new TtlCache<
    Record<PublicBoardKey, LeaderboardEntry[]>
  >(LEADERBOARDS_CACHE_TTL_MS);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly settings: StatsSettingsService,
  ) {}

  /// Сброс кэша: при смене приватности профиля и в тестах.
  invalidate(): void {
    this.cache.clear();
  }

  private async topByPlayerStatistics(
    field: 'playTime' | 'kills' | 'coins',
  ): Promise<LeaderboardEntry[]> {
    const rows = await this.prisma.playerStatistics.findMany({
      where: { [field]: { gt: 0 }, user: RANKED_USER },
      orderBy: { [field]: 'desc' },
      take: LIMIT,
      include: { user: { select: { id: true, username: true, avatar: true } } },
    });
    return rows.map((row, index) => ({
      rank: index + 1,
      userId: row.user.id,
      username: row.user.username,
      avatar: this.storage.publicUrl(row.user.avatar),
      value: row[field],
    }));
  }

  private async topByAchievements(): Promise<LeaderboardEntry[]> {
    const grouped = await this.prisma.userAchievement.groupBy({
      by: ['userId'],
      where: { isCompleted: true, user: RANKED_USER },
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
    grouped.forEach((g) => {
      const user = byId.get(g.userId);
      if (!user) return;
      entries.push({
        rank: entries.length + 1,
        userId: user.id,
        username: user.username,
        avatar: this.storage.publicUrl(user.avatar),
        value: g._count._all,
      });
    });
    return entries;
  }

  private async topByPurchases(): Promise<LeaderboardEntry[]> {
    const grouped = await this.prisma.order.groupBy({
      by: ['userId'],
      where: {
        status: OrderStatus.COMPLETED,
        userId: { not: null },
        user: { is: RANKED_USER },
      },
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
    grouped.forEach((g) => {
      if (!g.userId) return;
      const user = byId.get(g.userId);
      if (!user) return;
      entries.push({
        rank: entries.length + 1,
        userId: user.id,
        username: user.username,
        avatar: this.storage.publicUrl(user.avatar),
        value: g._count._all,
      });
    });
    return entries;
  }

  private loaders(): Record<BoardKey, () => Promise<LeaderboardEntry[]>> {
    return {
      playtime: () => this.topByPlayerStatistics('playTime'),
      kills: () => this.topByPlayerStatistics('kills'),
      coins: () => this.topByPlayerStatistics('coins'),
      achievements: () => this.topByAchievements(),
      purchases: () => this.topByPurchases(),
    };
  }

  private async loadAll(): Promise<Record<PublicBoardKey, LeaderboardEntry[]>> {
    const loaders = this.loaders();
    const keys = (Object.keys(loaders) as BoardKey[]).filter(
      (key): key is PublicBoardKey => !HIDDEN_BOARDS.includes(key),
    );
    const results = await Promise.all(keys.map((key) => loaders[key]()));
    return Object.fromEntries(
      keys.map((key, index) => [key, results[index]]),
    ) as Record<PublicBoardKey, LeaderboardEntry[]>;
  }

  /// Публичные рейтинги. Раздел выключен флагом — пустые таблицы без обращения
  /// к данным игроков. Включён — ответ из кэша (TTL, single-flight).
  async list(): Promise<PublicLeaderboards> {
    if (!(await this.settings.isPublicEnabled())) {
      return {
        enabled: false,
        playtime: [],
        kills: [],
        coins: [],
        achievements: [],
      };
    }
    const boards = await this.cache.getOrLoad(() => this.loadAll());
    return { enabled: true, ...boards };
  }
}
