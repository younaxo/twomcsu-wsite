import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProfileComment, User } from '@prisma/client';
import { escapeToHtml, extractMentions } from '../../common/html.util';
import { FriendsService } from '../friends/friends.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { ReactCommentDto } from './dto/react-comment.dto';
import { ReportCommentDto } from './dto/report-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { PUBLIC_USER_SELECT } from '../users/public-user';

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly friends: FriendsService,
    private readonly notifications: NotificationsService,
  ) {}

  private async getProfileOwner(username: string): Promise<User> {
    const user = await this.prisma.user.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
    });
    if (!user) {
      throw new NotFoundException('Профиль не найден');
    }
    return user;
  }

  private async canComment(viewerId: string, owner: User): Promise<boolean> {
    if (viewerId === owner.id) {
      return true;
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

  async list(username: string, page: number, limit: number) {
    const owner = await this.getProfileOwner(username);
    const [items, total] = await Promise.all([
      this.prisma.profileComment.findMany({
        where: { profileId: owner.id, isDeleted: false },
        include: { author: { select: PUBLIC_USER_SELECT }, reactions: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.profileComment.count({
        where: { profileId: owner.id, isDeleted: false },
      }),
    ]);
    return { items, total, page, limit };
  }

  async create(authorId: string, username: string, dto: CreateCommentDto) {
    const owner = await this.getProfileOwner(username);
    if (!owner.commentsEnabled) {
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
      include: { author: { select: PUBLIC_USER_SELECT } },
    });

    await this.notifyParticipants(created, owner, parent, mentions);

    return created;
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
    const link = `/users/${owner.username}#comment-${comment.id}`;

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
      if (mentioned && mentioned.notifyOnMention) {
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

  async update(authorId: string, commentId: string, dto: UpdateCommentDto) {
    const comment = await this.prisma.profileComment.findUnique({
      where: { id: commentId },
    });
    if (!comment || comment.isDeleted) {
      throw new NotFoundException('Комментарий не найден');
    }
    if (comment.authorId !== authorId) {
      throw new ForbiddenException(
        'Редактировать можно только свои комментарии',
      );
    }

    return this.prisma.profileComment.update({
      where: { id: commentId },
      data: {
        content: dto.content,
        contentHtml: escapeToHtml(dto.content),
        mentions: extractMentions(dto.content),
        isEdited: true,
        editedAt: new Date(),
      },
    });
  }

  async remove(authorId: string, commentId: string): Promise<void> {
    const comment = await this.prisma.profileComment.findUnique({
      where: { id: commentId },
    });
    if (!comment || comment.isDeleted) {
      throw new NotFoundException('Комментарий не найден');
    }
    if (comment.authorId !== authorId) {
      throw new ForbiddenException('Удалить можно только свои комментарии');
    }
    await this.prisma.profileComment.update({
      where: { id: commentId },
      data: { isDeleted: true, deletedAt: new Date(), deletedBy: authorId },
    });
  }

  async react(userId: string, commentId: string, dto: ReactCommentDto) {
    const comment = await this.prisma.profileComment.findUnique({
      where: { id: commentId },
    });
    if (!comment || comment.isDeleted) {
      throw new NotFoundException('Комментарий не найден');
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
    const comment = await this.prisma.profileComment.findUnique({
      where: { id: commentId },
    });
    if (!comment || comment.isDeleted) {
      throw new NotFoundException('Комментарий не найден');
    }
    return this.prisma.commentReport.upsert({
      where: { commentId_reporterId: { commentId, reporterId } },
      create: {
        commentId,
        reporterId,
        reason: dto.reason,
        description: dto.description,
      },
      update: { reason: dto.reason, description: dto.description },
    });
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
