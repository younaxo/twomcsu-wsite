import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProfileComment, User } from '@prisma/client';
import { escapeToHtml, extractMentions } from '../../common/html.util';
import { StorageService } from '../files/storage.service';
import { FriendsService } from '../friends/friends.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { resolveUserIdByHandle } from '../profiles/handle';
import { canViewProfile, isBlockedBetween } from '../profiles/visibility';
import { CreateCommentDto } from './dto/create-comment.dto';
import { COMMENT_REACTIONS, ReactCommentDto } from './dto/react-comment.dto';
import { ReportCommentDto } from './dto/report-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { PUBLIC_USER_SELECT, PublicUser } from '../users/public-user';

/// Комментарий в ответе (ADR-0111): автор — только публичные поля, реакции —
/// счётчики по набору реакций и своя реакция зрителя (без списка, кто
/// реагировал), права зрителя на правку и удаление.
export interface CommentView {
  id: string;
  parentId: string | null;
  content: string;
  createdAt: string;
  isEdited: boolean;
  /// Упомянутые ники (@ник) — для подсветки.
  mentions: string[];
  author: { id: string; username: string; tag: string; avatar: string | null };
  reactions: Array<{ key: string; count: number }>;
  myReaction: string | null;
  canEdit: boolean;
  canDelete: boolean;
}

type CommentRow = ProfileComment & {
  author: PublicUser;
  reactions: Array<{ userId: string; emoji: string }>;
};

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly friends: FriendsService,
    private readonly notifications: NotificationsService,
    private readonly storage: StorageService,
  ) {}

  private async getProfileOwner(handle: string): Promise<User> {
    const id = await resolveUserIdByHandle(this.prisma, handle);
    const user = id
      ? await this.prisma.user.findUnique({ where: { id } })
      : null;
    if (!user) {
      throw new NotFoundException('Профиль не найден');
    }
    return user;
  }

  /// Комментарии видны тем же, кому виден профиль; скрытый — 404.
  private async visibleOwner(handle: string, viewerId: string | null) {
    const owner = await this.getProfileOwner(handle);
    if (!(await canViewProfile(this.prisma, owner, viewerId))) {
      throw new NotFoundException('Профиль не найден');
    }
    return owner;
  }

  /// Комментарии на профиле включены владельцем и не отключены модерацией.
  private enabled(owner: User): boolean {
    return owner.commentsEnabled && !owner.commentsForcedDisabledBy;
  }

  private async canComment(viewerId: string, owner: User): Promise<boolean> {
    if (viewerId === owner.id) {
      return true;
    }
    // Блокировка в любую сторону — писать нельзя при любой политике.
    if (await isBlockedBetween(this.prisma, viewerId, owner.id)) {
      return false;
    }
    switch (owner.commentPolicy) {
      case 'EVERYONE':
        return true;
      case 'NOBODY':
        return false;
      case 'FRIENDS':
        return this.friends.isFriend(viewerId, owner.id);
      case 'FRIENDS_OF_FRIENDS':
        return this.friends.areFriendsOfFriends(viewerId, owner.id);
      default:
        return false;
    }
  }

  private view(
    row: CommentRow,
    viewerId: string | null,
    ownerId: string,
  ): CommentView {
    const counts = new Map<string, number>();
    for (const reaction of row.reactions) {
      if (!COMMENT_REACTIONS.includes(reaction.emoji as never)) continue;
      counts.set(reaction.emoji, (counts.get(reaction.emoji) ?? 0) + 1);
    }
    const mine = viewerId
      ? (row.reactions.find((reaction) => reaction.userId === viewerId)
          ?.emoji ?? null)
      : null;
    return {
      id: row.id,
      parentId: row.parentId,
      content: row.content,
      createdAt: row.createdAt.toISOString(),
      isEdited: row.isEdited,
      mentions: row.mentions,
      author: {
        id: row.author.id,
        username: row.author.username,
        tag: row.author.tag,
        avatar: this.storage.publicUrl(row.author.avatar),
      },
      reactions: COMMENT_REACTIONS.filter((key) => counts.has(key)).map(
        (key) => ({
          key,
          count: counts.get(key)!,
        }),
      ),
      myReaction:
        mine && COMMENT_REACTIONS.includes(mine as never) ? mine : null,
      canEdit: viewerId === row.authorId,
      canDelete: viewerId === row.authorId || viewerId === ownerId,
    };
  }

  private readonly include = {
    author: { select: PUBLIC_USER_SELECT },
    reactions: { select: { userId: true, emoji: true } },
  } as const;

  async list(
    handle: string,
    viewerId: string | null,
    page: number,
    limit: number,
  ) {
    const owner = await this.visibleOwner(handle, viewerId);
    const where = { profileId: owner.id, isDeleted: false };
    const [rows, total] = await Promise.all([
      this.prisma.profileComment.findMany({
        where,
        include: this.include,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.profileComment.count({ where }),
    ]);
    const enabled = this.enabled(owner);
    return {
      items: rows.map((row) => this.view(row, viewerId, owner.id)),
      total,
      page,
      limit,
      commentsEnabled: enabled,
      canComment:
        viewerId !== null &&
        enabled &&
        (await this.canComment(viewerId, owner)),
    };
  }

  async create(authorId: string, handle: string, dto: CreateCommentDto) {
    const owner = await this.visibleOwner(handle, authorId);
    if (!this.enabled(owner)) {
      throw new ForbiddenException('Комментарии на этом профиле отключены');
    }
    if (!(await this.canComment(authorId, owner))) {
      throw new ForbiddenException(
        'Недостаточно прав, чтобы оставить комментарий',
      );
    }

    let parent: ProfileComment | null = null;
    if (dto.parentId) {
      parent = await this.prisma.profileComment.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent || parent.profileId !== owner.id || parent.isDeleted) {
        throw new NotFoundException('Родительский комментарий не найден');
      }
    }

    const mentions = extractMentions(dto.content);
    const created = await this.prisma.profileComment.create({
      data: {
        profileId: owner.id,
        authorId,
        content: dto.content,
        contentHtml: escapeToHtml(dto.content),
        parentId: dto.parentId,
        mentions,
      },
      include: this.include,
    });

    await this.notifyParticipants(created, owner, parent, mentions);

    return this.view(created, authorId, owner.id);
  }

  private async notifyParticipants(
    comment: { id: string; authorId: string; profileId: string },
    owner: User,
    parent: ProfileComment | null,
    mentions: string[],
  ): Promise<void> {
    const author = await this.prisma.user.findUnique({
      where: { id: comment.authorId },
    });
    if (!author) {
      return;
    }
    const link = `/u/${encodeURIComponent(owner.username)}#comment-${comment.id}`;

    if (owner.id !== comment.authorId && owner.notifyOnComment) {
      await this.notifications.create({
        userId: owner.id,
        type: 'COMMENT_ON_PROFILE',
        title: `${author.username} оставил(а) комментарий на вашем профиле`,
        link,
        fromUserId: author.id,
      });
    }

    if (
      parent?.authorId &&
      parent.authorId !== comment.authorId &&
      parent.authorId !== owner.id
    ) {
      const parentAuthor = await this.prisma.user.findUnique({
        where: { id: parent.authorId },
      });
      if (parentAuthor?.notifyOnReply) {
        await this.notifications.create({
          userId: parentAuthor.id,
          type: 'COMMENT_REPLY',
          title: `${author.username} ответил(а) на ваш комментарий`,
          link,
          fromUserId: author.id,
        });
      }
    }

    for (const username of mentions) {
      if (username.toLowerCase() === author.username.toLowerCase()) {
        continue;
      }
      const mentioned = await this.prisma.user.findFirst({
        where: { username: { equals: username, mode: 'insensitive' } },
      });
      // Упоминание не раскрывает комментарии тому, кому профиль не виден.
      if (
        mentioned &&
        mentioned.notifyOnMention &&
        (await canViewProfile(this.prisma, owner, mentioned.id))
      ) {
        await this.notifications.create({
          userId: mentioned.id,
          type: 'COMMENT_MENTION',
          title: `${author.username} упомянул(а) вас в комментарии`,
          link,
          fromUserId: author.id,
        });
      }
    }
  }

  /// Комментарий и его профиль, видимый этому пользователю.
  private async visibleComment(userId: string, commentId: string) {
    const comment = await this.prisma.profileComment.findUnique({
      where: { id: commentId },
      include: { profile: true },
    });
    if (
      !comment ||
      comment.isDeleted ||
      !(await canViewProfile(this.prisma, comment.profile, userId))
    ) {
      throw new NotFoundException('Комментарий не найден');
    }
    return comment;
  }

  async update(authorId: string, commentId: string, dto: UpdateCommentDto) {
    const comment = await this.visibleComment(authorId, commentId);
    if (comment.authorId !== authorId) {
      throw new ForbiddenException(
        'Редактировать можно только свои комментарии',
      );
    }

    const updated = await this.prisma.profileComment.update({
      where: { id: commentId },
      data: {
        content: dto.content,
        contentHtml: escapeToHtml(dto.content),
        mentions: extractMentions(dto.content),
        isEdited: true,
        editedAt: new Date(),
      },
      include: this.include,
    });
    return this.view(updated, authorId, comment.profileId);
  }

  /// Удалить может автор и владелец профиля (порядок на своей стене).
  async remove(userId: string, commentId: string): Promise<void> {
    const comment = await this.visibleComment(userId, commentId);
    if (comment.authorId !== userId && comment.profileId !== userId) {
      throw new ForbiddenException('Удалить можно только свои комментарии');
    }
    await this.prisma.profileComment.update({
      where: { id: commentId },
      data: { isDeleted: true, deletedAt: new Date(), deletedBy: userId },
    });
  }

  async react(userId: string, commentId: string, dto: ReactCommentDto) {
    const comment = await this.visibleComment(userId, commentId);
    if (await isBlockedBetween(this.prisma, userId, comment.authorId)) {
      throw new ForbiddenException('Нельзя отреагировать на этот комментарий');
    }

    const existing = await this.prisma.commentReaction.findUnique({
      where: { commentId_userId: { commentId, userId } },
    });

    if (!existing) {
      await this.prisma.commentReaction.create({
        data: { commentId, userId, emoji: dto.emoji },
      });
      return { reacted: true, emoji: dto.emoji };
    }

    if (existing.emoji === dto.emoji) {
      await this.prisma.commentReaction.delete({ where: { id: existing.id } });
      return { reacted: false };
    }

    await this.prisma.commentReaction.update({
      where: { id: existing.id },
      data: { emoji: dto.emoji },
    });
    return { reacted: true, emoji: dto.emoji };
  }

  async report(reporterId: string, commentId: string, dto: ReportCommentDto) {
    const comment = await this.visibleComment(reporterId, commentId);
    if (comment.authorId === reporterId) {
      throw new ForbiddenException('Нельзя пожаловаться на свой комментарий');
    }
    await this.prisma.commentReport.upsert({
      where: { commentId_reporterId: { commentId, reporterId } },
      create: {
        commentId,
        reporterId,
        reason: dto.reason,
        description: dto.description,
      },
      update: { reason: dto.reason, description: dto.description },
    });
    return { success: true };
  }

  /// Безвозвратное удаление (в отличие от remove() — soft-delete автором).
  /// Каскадом удаляет ответы на комментарий (ProfileComment.parent — onDelete:
  /// Cascade в schema.prisma) — осознанное поведение модераторского
  /// инструмента, не баг.
  async hardDelete(commentId: string): Promise<void> {
    const comment = await this.prisma.profileComment.findUnique({
      where: { id: commentId },
    });
    if (!comment) {
      throw new NotFoundException('Комментарий не найден');
    }
    await this.prisma.profileComment.delete({ where: { id: commentId } });
  }
}
