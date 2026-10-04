import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AchievementProgressService } from './achievement-progress.service';
import { CreateAchievementDto } from './dto/create-achievement.dto';
import { ListAchievementsQueryDto } from './dto/list-achievements-query.dto';
import { SetShowcaseDto } from './dto/set-showcase.dto';
import { UpdateAchievementDto } from './dto/update-achievement.dto';

@Injectable()
export class AchievementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly progress: AchievementProgressService,
  ) {}

  /// Публичный список — не-секретные достижения всегда, секретные
  /// (isSecret) только если уже разблокированы этим viewer'ом (не
  /// спойлерим условие тем, кто его ещё не выполнил).
  async getAllAchievements(
    viewerId: string | null,
    query: ListAchievementsQueryDto,
  ) {
    const where: Prisma.AchievementWhereInput = {
      isActive: true,
      ...(query.category ? { category: query.category } : {}),
      ...(query.rarity ? { rarity: query.rarity } : {}),
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };
    const achievements = await this.prisma.achievement.findMany({
      where,
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
    });
    const userAchievements = viewerId
      ? await this.prisma.userAchievement.findMany({
          where: { userId: viewerId },
        })
      : [];
    const byAchievementId = new Map(
      userAchievements.map((ua) => [ua.achievementId, ua]),
    );

    const withProgress = achievements
      .map((achievement) => {
        const ua = byAchievementId.get(achievement.id);
        if (achievement.isSecret && !ua?.isCompleted) {
          return null;
        }
        return {
          ...achievement,
          currentProgress: ua?.currentProgress ?? 0,
          isCompleted: ua?.isCompleted ?? false,
          completedAt: ua?.completedAt ?? null,
        };
      })
      .filter((a): a is NonNullable<typeof a> => a !== null);

    if (query.filter === 'completed') {
      return withProgress.filter((a) => a.isCompleted);
    }
    if (query.filter === 'incomplete') {
      return withProgress.filter((a) => !a.isCompleted);
    }
    return withProgress;
  }

  async getStats() {
    const [total, totalUnlocks, byRarity] = await Promise.all([
      this.prisma.achievement.count({ where: { isActive: true } }),
      this.prisma.userAchievement.count({ where: { isCompleted: true } }),
      this.prisma.achievement.groupBy({
        by: ['rarity'],
        where: { isActive: true },
        _count: true,
      }),
    ]);
    return {
      total,
      totalUnlocks,
      byRarity: Object.fromEntries(byRarity.map((r) => [r.rarity, r._count])),
    };
  }

  async getAchievementBySlug(slug: string, viewerId: string | null) {
    const achievement = await this.prisma.achievement.findUnique({
      where: { slug },
    });
    if (!achievement || !achievement.isActive) {
      throw new NotFoundException('Достижение не найдено');
    }
    const ua = viewerId
      ? await this.prisma.userAchievement.findUnique({
          where: {
            userId_achievementId: {
              userId: viewerId,
              achievementId: achievement.id,
            },
          },
        })
      : null;
    if (achievement.isSecret && !ua?.isCompleted) {
      throw new NotFoundException('Достижение не найдено');
    }
    return {
      ...achievement,
      currentProgress: ua?.currentProgress ?? 0,
      isCompleted: ua?.isCompleted ?? false,
      completedAt: ua?.completedAt ?? null,
    };
  }

  async listAdmin() {
    return this.prisma.achievement.findMany({
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
    });
  }

  async create(dto: CreateAchievementDto) {
    const existing = await this.prisma.achievement.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException('Достижение с таким slug уже существует');
    }
    return this.prisma.achievement.create({
      data: {
        ...dto,
        conditionParams: dto.conditionParams as Prisma.InputJsonValue,
      },
    });
  }

  private async requireAchievement(id: string) {
    const achievement = await this.prisma.achievement.findUnique({
      where: { id },
    });
    if (!achievement) {
      throw new NotFoundException('Достижение не найдено');
    }
    return achievement;
  }

  async update(id: string, dto: UpdateAchievementDto) {
    await this.requireAchievement(id);
    return this.prisma.achievement.update({
      where: { id },
      data: {
        ...dto,
        conditionParams: dto.conditionParams as Prisma.InputJsonValue,
      },
    });
  }

  async remove(id: string): Promise<void> {
    await this.requireAchievement(id);
    await this.prisma.achievement.delete({ where: { id } });
  }

  async checkAllUsers() {
    return this.progress.checkAllUsers();
  }

  async getUserAchievements(userId: string) {
    return this.buildUserAchievementsResponse(userId, true);
  }

  async getUserAchievementsByUsername(
    username: string,
    viewerIsOwner: boolean,
  ) {
    const user = await this.prisma.user.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
    });
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }
    return this.buildUserAchievementsResponse(user.id, viewerIsOwner);
  }

  private async buildUserAchievementsResponse(
    userId: string,
    includeSecretProgress: boolean,
  ) {
    const userAchievements = await this.prisma.userAchievement.findMany({
      where: { userId },
      include: { achievement: true },
      orderBy: [{ isCompleted: 'desc' }, { updatedAt: 'desc' }],
    });
    const visible = userAchievements.filter(
      (ua) =>
        includeSecretProgress || !ua.achievement.isSecret || ua.isCompleted,
    );
    return {
      items: visible.map((ua) => ({
        achievement: ua.achievement,
        currentProgress: ua.currentProgress,
        isCompleted: ua.isCompleted,
        completedAt: ua.completedAt,
        isShowcased: ua.isShowcased,
        showcaseOrder: ua.showcaseOrder,
      })),
      completedCount: userAchievements.filter((ua) => ua.isCompleted).length,
      showcased: userAchievements
        .filter((ua) => ua.isShowcased)
        .sort((a, b) => a.showcaseOrder - b.showcaseOrder)
        .map((ua) => ua.achievement),
    };
  }

  async setShowcase(userId: string, dto: SetShowcaseDto) {
    const achievements = await this.prisma.userAchievement.findMany({
      where: { userId, achievementId: { in: dto.achievementIds } },
    });
    if (achievements.length !== dto.achievementIds.length) {
      throw new BadRequestException(
        'Одно или несколько достижений не найдены у этого пользователя',
      );
    }
    if (achievements.some((a) => !a.isCompleted)) {
      throw new BadRequestException(
        'В витрину можно добавить только завершённые достижения',
      );
    }
    await this.prisma.$transaction([
      this.prisma.userAchievement.updateMany({
        where: { userId },
        data: { isShowcased: false, showcaseOrder: 0 },
      }),
      ...dto.achievementIds.map((achievementId, index) =>
        this.prisma.userAchievement.update({
          where: { userId_achievementId: { userId, achievementId } },
          data: { isShowcased: true, showcaseOrder: index },
        }),
      ),
    ]);
    return this.getUserAchievements(userId);
  }

  async removeFromShowcase(
    userId: string,
    achievementId: string,
  ): Promise<void> {
    const ua = await this.prisma.userAchievement.findUnique({
      where: { userId_achievementId: { userId, achievementId } },
    });
    if (!ua) {
      throw new NotFoundException('Достижение не найдено у этого пользователя');
    }
    await this.prisma.userAchievement.update({
      where: { id: ua.id },
      data: { isShowcased: false, showcaseOrder: 0 },
    });
  }

  async grantAchievement(userId: string, achievementId: string): Promise<void> {
    const achievement = await this.requireAchievement(achievementId);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }
    const existing = await this.prisma.userAchievement.findUnique({
      where: { userId_achievementId: { userId, achievementId } },
    });
    if (existing?.isCompleted) {
      throw new ConflictException('Достижение уже выдано этому пользователю');
    }
    await this.prisma.userAchievement.upsert({
      where: { userId_achievementId: { userId, achievementId } },
      create: {
        userId,
        achievementId,
        currentProgress: achievement.conditionValue ?? 1,
        isCompleted: true,
        completedAt: new Date(),
        rewardsGranted: true,
      },
      update: {
        isCompleted: true,
        completedAt: new Date(),
        rewardsGranted: true,
      },
    });
    await this.prisma.achievement.update({
      where: { id: achievementId },
      data: { unlockedCount: { increment: existing?.isCompleted ? 0 : 1 } },
    });
  }

  async revokeAchievement(
    userId: string,
    achievementId: string,
  ): Promise<void> {
    const ua = await this.prisma.userAchievement.findUnique({
      where: { userId_achievementId: { userId, achievementId } },
    });
    if (!ua) {
      throw new NotFoundException('Достижение не найдено у этого пользователя');
    }
    await this.prisma.$transaction([
      this.prisma.userAchievement.delete({ where: { id: ua.id } }),
      ...(ua.isCompleted
        ? [
            this.prisma.achievement.update({
              where: { id: achievementId },
              data: { unlockedCount: { decrement: 1 } },
            }),
          ]
        : []),
    ]);
  }
}
