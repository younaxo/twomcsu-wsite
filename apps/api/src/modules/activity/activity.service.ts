import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { escapeToHtml } from '../../common/html.util';
import { FriendsService } from '../friends/friends.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateActivityCommentDto } from './dto/create-activity-comment.dto';
import { ReactActivityDto } from './dto/react-activity.dto';
import { UpdateActivitySettingsDto } from './dto/update-activity-settings.dto';

const DEFAULT_SETTINGS: Omit<Prisma.ActivityFeedSettingsCreateInput, 'user'> =
  {};

@Injectable()
export class ActivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly friends: FriendsService,
  ) {}

  async listGlobalFeed(page: number, limit: number) {
    const where: Prisma.ActivityWhereInput = {
      visibility: 'PUBLIC',
      isHidden: false,
    };
    const [items, total] = await Promise.all([
      this.prisma.activity.findMany({
        where,
        include: {
          user: true,
          reactions: true,
          _count: { select: { comments: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.activity.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async listUserFeed(
    username: string,
    viewerId: string | null,
    page: number,
    limit: number,
  ) {
    const owner = await this.prisma.user.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
    });
    if (!owner) {
      throw new NotFoundException('Пользователь не найден');
    }

    const isOwner = viewerId !== null && viewerId === owner.id;
    const isFriend =
      !isOwner &&
      viewerId !== null &&
      (await this.friends.isFriend(viewerId, owner.id));

    const visibilityIn: Prisma.ActivityWhereInput['visibility'] = isOwner
      ? undefined
      : isFriend
        ? { in: ['PUBLIC', 'FRIENDS'] }
        : 'PUBLIC';

    const where: Prisma.ActivityWhereInput = {
      userId: owner.id,
      isHidden: false,
      ...(visibilityIn !== undefined ? { visibility: visibilityIn } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.activity.findMany({
        where,
        include: {
          user: true,
          reactions: true,
          _count: { select: { comments: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.activity.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  private async assertVisible(activityId: string, viewerId: string | null) {
    const activity = await this.prisma.activity.findUnique({
      where: { id: activityId },
    });
    if (!activity || activity.isHidden) {
      throw new NotFoundException('Запись активности не найдена');
    }
    const isOwner = viewerId !== null && viewerId === activity.userId;
    if (isOwner || activity.visibility === 'PUBLIC') {
      return activity;
    }
    if (activity.visibility === 'FRIENDS' && viewerId !== null) {
      const isFriend = await this.friends.isFriend(viewerId, activity.userId);
      if (isFriend) {
        return activity;
      }
    }
    throw new NotFoundException('Запись активности не найдена');
  }

  async getOne(activityId: string, viewerId: string | null) {
    return this.assertVisible(activityId, viewerId);
  }

  async getSettings(userId: string) {
    return this.prisma.activityFeedSettings.upsert({
      where: { userId },
      create: { userId, ...DEFAULT_SETTINGS },
      update: {},
    });
  }

  async updateSettings(userId: string, dto: UpdateActivitySettingsDto) {
    return this.prisma.activityFeedSettings.upsert({
      where: { userId },
      create: { userId, ...dto },
      update: dto,
    });
  }

  async react(userId: string, activityId: string, dto: ReactActivityDto) {
    await this.assertVisible(activityId, userId);

    const existing = await this.prisma.activityReaction.findUnique({
      where: { activityId_userId: { activityId, userId } },
    });

    if (!existing) {
      await this.prisma.activityReaction.create({
        data: { activityId, userId, emoji: dto.emoji },
      });
      return { reacted: true, emoji: dto.emoji };
    }
    if (existing.emoji === dto.emoji) {
      await this.prisma.activityReaction.delete({ where: { id: existing.id } });
      return { reacted: false };
    }
    await this.prisma.activityReaction.update({
      where: { id: existing.id },
      data: { emoji: dto.emoji },
    });
    return { reacted: true, emoji: dto.emoji };
  }

  async comment(
    userId: string,
    activityId: string,
    dto: CreateActivityCommentDto,
  ) {
    await this.assertVisible(activityId, userId);
    return this.prisma.activityComment.create({
      data: {
        activityId,
        authorId: userId,
        content: dto.content,
        contentHtml: escapeToHtml(dto.content),
      },
      include: { author: true },
    });
  }

  async removeComment(userId: string, commentId: string): Promise<void> {
    const comment = await this.prisma.activityComment.findUnique({
      where: { id: commentId },
    });
    if (!comment || comment.isDeleted) {
      throw new NotFoundException('Комментарий не найден');
    }
    if (comment.authorId !== userId) {
      throw new ForbiddenException('Удалить можно только свои комментарии');
    }
    await this.prisma.activityComment.update({
      where: { id: commentId },
      data: { isDeleted: true, deletedAt: new Date(), deletedBy: userId },
    });
  }
}
