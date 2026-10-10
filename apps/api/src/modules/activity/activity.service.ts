import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { escapeToHtml, extractMentions } from '../../common/html.util';
import { StorageService } from '../files/storage.service';
import { FriendsService } from '../friends/friends.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { canViewProfile } from '../profiles/visibility';
import { CreateActivityCommentDto } from './dto/create-activity-comment.dto';
import { ACTIVITY_REACTIONS, ReactActivityDto } from './dto/react-activity.dto';
import { UpdateActivitySettingsDto } from './dto/update-activity-settings.dto';
import { PUBLIC_USER_SELECT, PublicUser } from '../users/public-user';

const DEFAULT_SETTINGS: Omit<Prisma.ActivityFeedSettingsCreateInput, 'user'> =
  {};

/// Запись активности в ответе (ADR-0114): автор — публичные поля (аватар-URL),
/// реакции — счётчики по набору и своя реакция (без списка реагировавших),
/// для дружбы — ник друга.
export interface ActivityView {
  id: string;
  type: string;
  title: string;
  description: string | null;
  visibility: string;
  createdAt: string;
  user: PublicUser;
  friend: { username: string } | null;
  reactions: Array<{ key: string; count: number }>;
  myReaction: string | null;
  commentsCount: number;
}

const ACTIVITY_INCLUDE = {
  user: { select: PUBLIC_USER_SELECT },
  reactions: { select: { userId: true, emoji: true } },
  _count: { select: { comments: { where: { isDeleted: false } } } },
} as const;

type ActivityRow = Prisma.ActivityGetPayload<{
  include: typeof ACTIVITY_INCLUDE;
}>;

@Injectable()
export class ActivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly friends: FriendsService,
    private readonly notifications: NotificationsService,
    private readonly storage: StorageService,
  ) {}

  private avatar<T extends { avatar: string | null }>(user: T): T {
    return { ...user, avatar: this.storage.publicUrl(user.avatar) };
  }

  private async views(
    rows: ActivityRow[],
    viewerId: string | null,
  ): Promise<ActivityView[]> {
    const friendIds = rows
      .map((row) => (row.metadata as { friendId?: string } | null)?.friendId)
      .filter((id): id is string => typeof id === 'string');
    const friends = friendIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: friendIds } },
          select: { id: true, username: true },
        })
      : [];
    const names = new Map(
      friends.map((friend) => [friend.id, friend.username]),
    );
    return rows.map((row) => {
      const counts = new Map<string, number>();
      for (const reaction of row.reactions) {
        if (!ACTIVITY_REACTIONS.includes(reaction.emoji as never)) continue;
        counts.set(reaction.emoji, (counts.get(reaction.emoji) ?? 0) + 1);
      }
      const mine = viewerId
        ? (row.reactions.find((reaction) => reaction.userId === viewerId)
            ?.emoji ?? null)
        : null;
      const friendId = (row.metadata as { friendId?: string } | null)?.friendId;
      const friendName = friendId ? names.get(friendId) : undefined;
      return {
        id: row.id,
        type: row.type,
        title: row.title,
        description: row.description,
        visibility: row.visibility,
        createdAt: row.createdAt.toISOString(),
        user: this.avatar(row.user),
        friend: friendName ? { username: friendName } : null,
        reactions: ACTIVITY_REACTIONS.filter((key) => counts.has(key)).map(
          (key) => ({
            key,
            count: counts.get(key)!,
          }),
        ),
        myReaction:
          mine && ACTIVITY_REACTIONS.includes(mine as never) ? mine : null,
        commentsCount: row._count.comments,
      };
    });
  }

  /// Глобальная лента — только PUBLIC-записи игроков с открытым профилем:
  /// скрытый профиль (NOBODY / FRIENDS_ONLY) не светит активность всем.
  async listGlobalFeed(page: number, limit: number) {
    const where: Prisma.ActivityWhereInput = {
      visibility: 'PUBLIC',
      isHidden: false,
      user: { profileVisibility: 'EVERYONE', isBanned: false },
    };
    const [rows, total] = await Promise.all([
      this.prisma.activity.findMany({
        where,
        include: ACTIVITY_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.activity.count({ where }),
    ]);
    return { items: await this.views(rows, null), total, page, limit };
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
    // Активность видна тем же, кому виден профиль (ADR-0114); скрытый — 404.
    if (!owner || !(await canViewProfile(this.prisma, owner, viewerId))) {
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

    const [rows, total] = await Promise.all([
      this.prisma.activity.findMany({
        where,
        include: ACTIVITY_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.activity.count({ where }),
    ]);
    return { items: await this.views(rows, viewerId), total, page, limit };
  }

  /// Запись видна, если виден профиль автора и это разрешает видимость записи.
  private async assertVisible(activityId: string, viewerId: string | null) {
    const activity = await this.prisma.activity.findUnique({
      where: { id: activityId },
      include: { user: { select: { id: true, profileVisibility: true } } },
    });
    if (
      !activity ||
      activity.isHidden ||
      !(await canViewProfile(this.prisma, activity.user, viewerId))
    ) {
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
    await this.assertVisible(activityId, viewerId);
    const row = await this.prisma.activity.findUniqueOrThrow({
      where: { id: activityId },
      include: ACTIVITY_INCLUDE,
    });
    const [view] = await this.views([row], viewerId);
    return view;
  }

  /// Комментарии записи — по видимости записи; автор — публичные поля.
  async listComments(
    activityId: string,
    viewerId: string | null,
    page: number,
    limit: number,
  ) {
    await this.assertVisible(activityId, viewerId);
    const where = { activityId, isDeleted: false };
    const [rows, total] = await Promise.all([
      this.prisma.activityComment.findMany({
        where,
        include: { author: { select: PUBLIC_USER_SELECT } },
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.activityComment.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        content: row.content,
        createdAt: row.createdAt.toISOString(),
        author: this.avatar(row.author),
        canDelete: viewerId === row.authorId,
      })),
      total,
      page,
      limit,
    };
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
    const activity = await this.assertVisible(activityId, userId);
    const created = await this.prisma.activityComment.create({
      data: {
        activityId,
        authorId: userId,
        content: dto.content,
        contentHtml: escapeToHtml(dto.content),
      },
      include: { author: { select: PUBLIC_USER_SELECT } },
    });

    await this.notifyCommentParticipants(
      activity.userId,
      activityId,
      created.author,
      dto.content,
    );

    return {
      id: created.id,
      content: created.content,
      createdAt: created.createdAt.toISOString(),
      author: this.avatar(created.author),
      canDelete: true,
    };
  }

  /// mentions вычисляются на лету только для рассылки уведомлений —
  /// ActivityComment не хранит их персистентно (нет поля mentions в схеме,
  /// в отличие от ProfileComment/ChatMessage).
  private async notifyCommentParticipants(
    activityOwnerId: string,
    activityId: string,
    author: { id: string; username: string },
    content: string,
  ): Promise<void> {
    const link = `/feed/${activityId}`;

    if (activityOwnerId !== author.id) {
      const settings = await this.getSettings(activityOwnerId);
      if (settings.notifyOnComment) {
        await this.notifications.create({
          userId: activityOwnerId,
          type: 'ACTIVITY_COMMENT',
          title: `${author.username} прокомментировал(а) вашу активность`,
          link,
          fromUserId: author.id,
        });
      }
    }

    for (const username of extractMentions(content)) {
      if (username.toLowerCase() === author.username.toLowerCase()) {
        continue;
      }
      const mentioned = await this.prisma.user.findFirst({
        where: { username: { equals: username, mode: 'insensitive' } },
      });
      if (
        mentioned &&
        mentioned.id !== activityOwnerId &&
        mentioned.notifyOnMention
      ) {
        await this.notifications.create({
          userId: mentioned.id,
          type: 'ACTIVITY_COMMENT_MENTION',
          title: `${author.username} упомянул(а) вас в комментарии к активности`,
          link,
          fromUserId: author.id,
        });
      }
    }
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
