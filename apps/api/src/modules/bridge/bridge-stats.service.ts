import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LeaderboardsService } from '../leaderboards/leaderboards.service';
import { BridgeRedisService } from './bridge-redis.service';
import { StatsSnapshotData } from './bridge-schema';

/// Не чаще одного сброса кэша рейтингов за интервал (поток снимков не должен
/// сбрасывать кэш на каждый запрос). Сброс «с хвостом»: изменение, пришедшее
/// внутри интервала, даёт один отложенный сброс в его конце.
export const RANKINGS_INVALIDATE_INTERVAL_MS = 5_000;

export type StatsApplyResult = 'applied' | 'skipped_unlinked' | 'stale';

/// Применение `player.stats.snapshot` (ADR-0195, Q68): игрок ищется по UUID в
/// `MinecraftAccount`; пишутся только существующие поля `PlayerStatistics`.
/// Монотонность - по времени снимка (`occurredAt`) общим для игрока маркером
/// Redis (не зависит от сервера); вызывается под блокировкой записи игрока.
@Injectable()
export class BridgeStatsService implements OnModuleDestroy {
  private readonly logger = new Logger(BridgeStatsService.name);
  private lastInvalidateAt = 0;
  private trailing: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: BridgeRedisService,
    private readonly leaderboards: LeaderboardsService,
  ) {}

  onModuleDestroy(): void {
    if (this.trailing !== null) clearTimeout(this.trailing);
    this.trailing = null;
  }

  /// Внутренний id пользователя по UUID игрока; null - аккаунт не привязан.
  async findUserId(uuid: string): Promise<string | null> {
    const acc = await this.prisma.minecraftAccount.findUnique({
      where: { uuid },
      select: { userId: true },
    });
    return acc?.userId ?? null;
  }

  /// Вызывать под `withRecordLock(..., 'stats', userId)`.
  async apply(
    serverSlug: string,
    userId: string,
    data: StatsSnapshotData,
    snapshotMs: number,
  ): Promise<StatsApplyResult> {
    if (!(await this.redis.claimMarker('all', 'stats', userId, snapshotMs))) {
      return 'stale';
    }
    const m = data.metrics;
    const existing = await this.prisma.playerStatistics.findUnique({
      where: { userId },
      select: { playTime: true, kills: true, deaths: true, hits: true },
    });
    const playTime = m.playTimeMinutes ?? existing?.playTime ?? 0;
    const kills = m.kills ?? existing?.kills ?? 0;
    const deaths = m.deaths ?? existing?.deaths ?? 0;
    const hits = m.hits ?? existing?.hits ?? 0;
    const killDeathRatio =
      deaths > 0 ? Math.round((kills / deaths) * 100) / 100 : kills;
    const values = {
      playTime,
      kills,
      deaths,
      hits,
      killDeathRatio,
      lastServer: serverSlug,
    };
    await this.prisma.playerStatistics.upsert({
      where: { userId },
      create: { userId, ...values },
      update: values,
    });
    this.invalidateRankings();
    return 'applied';
  }

  /// Сброс кэша рейтингов с троттлингом (снимки и бан/разбан через Bridge).
  invalidateRankings(): void {
    const now = Date.now();
    const wait = this.lastInvalidateAt + RANKINGS_INVALIDATE_INTERVAL_MS - now;
    if (wait <= 0) {
      this.lastInvalidateAt = now;
      this.leaderboards.invalidate();
      return;
    }
    if (this.trailing !== null) return;
    this.trailing = setTimeout(() => {
      this.trailing = null;
      this.lastInvalidateAt = Date.now();
      try {
        this.leaderboards.invalidate();
      } catch {
        this.logger.warn('bridge rankings invalidate failed');
      }
    }, wait);
    this.trailing.unref();
  }
}
