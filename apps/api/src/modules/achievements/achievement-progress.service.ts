import { Injectable } from '@nestjs/common';
import {
  Achievement,
  AchievementConditionType,
  FriendshipStatus,
  OrderStatus,
  Prisma,
  UserBadgeType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/// Типы условий, у которых нет и не будет авторасчёта — выдаются только
/// вручную модератором (MANUAL) или через внешний/ручной код (CUSTOM).
const MANUAL_CONDITION_TYPES = new Set<AchievementConditionType>([
  AchievementConditionType.MANUAL,
  AchievementConditionType.CUSTOM,
]);

/// REGISTRATION_ORDER сравнивается в обратную сторону — "среди первых N
/// зарегистрированных" (меньше shortId = раньше), а не "накоплено >= N".
const INVERTED_CONDITION_TYPES = new Set<AchievementConditionType>([
  AchievementConditionType.REGISTRATION_ORDER,
]);

export interface AchievementUnlockResult {
  achievementId: string;
  slug: string;
  currentProgress: number;
  isCompleted: boolean;
  justCompleted: boolean;
}

/// Вычисляет текущее значение метрики для каждого ConditionType и
/// обновляет UserAchievement. Источник данных — реальные таблицы
/// (PlayerStatistics/Friendship/ProfileComment/CommentReaction/Order/
/// OrderItem/Report/UserBadge/User) — никаких моковых чисел.
/// DAYS_STREAK и PROFILE_VIEWS честно не поддержаны — в схеме нет
/// персистентного счётчика ни для серии дней входа, ни для просмотров
/// профиля (см. ADR Gamification); прогресс по ним не продвигается
/// автоматически, только вручную.
@Injectable()
export class AchievementProgressService {
  constructor(private readonly prisma: PrismaService) {}

  private async computeMetric(
    userId: string,
    achievement: Achievement,
  ): Promise<number | null> {
    switch (achievement.conditionType) {
      case AchievementConditionType.PLAYTIME_MINUTES: {
        const stats = await this.prisma.playerStatistics.findUnique({
          where: { userId },
        });
        return stats?.playTime ?? 0;
      }
      case AchievementConditionType.KILLS_COUNT: {
        const stats = await this.prisma.playerStatistics.findUnique({
          where: { userId },
        });
        return stats?.kills ?? 0;
      }
      case AchievementConditionType.DEATHS_COUNT: {
        const stats = await this.prisma.playerStatistics.findUnique({
          where: { userId },
        });
        return stats?.deaths ?? 0;
      }
      case AchievementConditionType.FRIENDS_COUNT:
        return this.prisma.friendship.count({
          where: {
            status: FriendshipStatus.ACCEPTED,
            OR: [{ requesterId: userId }, { addresseeId: userId }],
          },
        });
      case AchievementConditionType.COMMENTS_COUNT:
        return this.prisma.profileComment.count({
          where: { authorId: userId, isDeleted: false },
        });
      case AchievementConditionType.LIKES_RECEIVED:
        return this.prisma.commentReaction.count({
          where: { comment: { authorId: userId } },
        });
      case AchievementConditionType.PURCHASES_COUNT:
        return this.prisma.order.count({
          where: { userId, status: OrderStatus.COMPLETED },
        });
      case AchievementConditionType.TOTAL_SPENT: {
        const result = await this.prisma.order.aggregate({
          where: { userId, status: OrderStatus.COMPLETED },
          _sum: { total: true },
        });
        return (result._sum.total ?? new Prisma.Decimal(0)).toNumber();
      }
      case AchievementConditionType.GIFTS_SENT:
        return this.prisma.orderItem.count({
          where: {
            giftToUserId: { not: null },
            order: { userId, status: OrderStatus.COMPLETED },
          },
        });
      case AchievementConditionType.GIFTS_RECEIVED:
        return this.prisma.orderItem.count({
          where: {
            giftToUserId: userId,
            order: { status: OrderStatus.COMPLETED },
          },
        });
      case AchievementConditionType.ACCOUNT_AGE_DAYS: {
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
        });
        if (!user) return null;
        return Math.floor((Date.now() - user.createdAt.getTime()) / 86_400_000);
      }
      case AchievementConditionType.BADGES_COUNT:
        return this.prisma.userBadge.count({
          where: { userId, isActive: true },
        });
      case AchievementConditionType.REGISTRATION_ORDER: {
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
        });
        return user?.shortId ?? null;
      }
      case AchievementConditionType.BUG_REPORTED:
        return this.prisma.report.count({
          where: { authorId: userId, type: 'TECHNICAL_ISSUE' },
        });
      case AchievementConditionType.REPORTS_RESOLVED:
        return this.prisma.report.count({
          where: { assignedToId: userId, status: 'RESOLVED' },
        });
      case AchievementConditionType.DAYS_STREAK:
      case AchievementConditionType.PROFILE_VIEWS:
        return null;
      case AchievementConditionType.MANUAL:
      case AchievementConditionType.CUSTOM:
        return null;
      default:
        return null;
    }
  }

  private isMet(achievement: Achievement, progress: number): boolean {
    if (achievement.conditionValue === null) {
      return false;
    }
    return INVERTED_CONDITION_TYPES.has(achievement.conditionType)
      ? progress <= achievement.conditionValue
      : progress >= achievement.conditionValue;
  }

  private async grantRewards(
    userId: string,
    achievement: Achievement,
  ): Promise<void> {
    const badgeType = Object.values(UserBadgeType).find(
      (t) => t === achievement.rewardBadgeType,
    );
    if (badgeType) {
      await this.prisma.userBadge.upsert({
        where: { userId_type: { userId, type: badgeType } },
        create: { userId, type: badgeType },
        update: { isActive: true },
      });
    }
    // rewardBadgeType, не совпадающий ни с одним значением UserBadgeType, —
    // ошибка конфигурации достижения админом, молча пропускается (сама
    // выдача достижения не должна падать из-за опечатки в награде).
    // rewardRubies: в схеме нет баланса премиум-валюты пользователя (см.
    // ADR-0035, Store) — поле хранится на Achievement как заявленная
    // награда, но не зачисляется никуда; rewardTitle/rewardMessage —
    // только отображаемый текст, уже возвращается с самим Achievement.
  }

  /// Пересчитывает прогресс одного активного (не MANUAL/CUSTOM) достижения
  /// для пользователя, сохраняет UserAchievement, при первом достижении
  /// условия — завершает и выдаёт награды.
  async checkOne(
    userId: string,
    achievement: Achievement,
  ): Promise<AchievementUnlockResult | null> {
    if (MANUAL_CONDITION_TYPES.has(achievement.conditionType)) {
      return null;
    }
    const metric = await this.computeMetric(userId, achievement);
    if (metric === null) {
      return null;
    }

    const existing = await this.prisma.userAchievement.findUnique({
      where: {
        userId_achievementId: { userId, achievementId: achievement.id },
      },
    });
    if (existing?.isCompleted) {
      return {
        achievementId: achievement.id,
        slug: achievement.slug,
        currentProgress: existing.currentProgress,
        isCompleted: true,
        justCompleted: false,
      };
    }

    const completed = this.isMet(achievement, metric);
    const userAchievement = await this.prisma.userAchievement.upsert({
      where: {
        userId_achievementId: { userId, achievementId: achievement.id },
      },
      create: {
        userId,
        achievementId: achievement.id,
        currentProgress: metric,
        isCompleted: completed,
        completedAt: completed ? new Date() : undefined,
      },
      update: {
        currentProgress: metric,
        ...(completed ? { isCompleted: true, completedAt: new Date() } : {}),
      },
    });

    if (completed && !existing?.isCompleted) {
      await this.prisma.achievement.update({
        where: { id: achievement.id },
        data: { unlockedCount: { increment: 1 } },
      });
      await this.grantRewards(userId, achievement);
      await this.prisma.userAchievement.update({
        where: { id: userAchievement.id },
        data: { rewardsGranted: true },
      });
    }

    return {
      achievementId: achievement.id,
      slug: achievement.slug,
      currentProgress: userAchievement.currentProgress,
      isCompleted: userAchievement.isCompleted,
      justCompleted: completed && !existing?.isCompleted,
    };
  }

  async checkUser(userId: string): Promise<AchievementUnlockResult[]> {
    const achievements = await this.prisma.achievement.findMany({
      where: { isActive: true },
    });
    const results: AchievementUnlockResult[] = [];
    for (const achievement of achievements) {
      const result = await this.checkOne(userId, achievement);
      if (result) {
        results.push(result);
      }
    }
    return results;
  }

  /// Вызывается только явно администратором (POST /admin/achievements/
  /// check-all-users) — нет фоновой периодичности (нет cron-инфраструктуры,
  /// PHASE 29).
  async checkAllUsers(): Promise<{
    usersChecked: number;
    unlocksGranted: number;
  }> {
    const users = await this.prisma.user.findMany({ select: { id: true } });
    let unlocksGranted = 0;
    for (const user of users) {
      const results = await this.checkUser(user.id);
      unlocksGranted += results.filter((r) => r.justCompleted).length;
    }
    return { usersChecked: users.length, unlocksGranted };
  }
}
