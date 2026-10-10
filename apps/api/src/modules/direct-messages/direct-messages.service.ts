import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConversationRole, ConversationType } from '@prisma/client';
import { randomBytes } from 'crypto';
import { escapeToHtml } from '../../common/html.util';
import { FriendsService } from '../friends/friends.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StorageService } from '../files/storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDirectConversationDto } from './dto/create-direct-conversation.dto';
import { CreateGroupConversationDto } from './dto/create-group-conversation.dto';
import { CreateInviteDto } from './dto/create-invite.dto';
import { EditMessageDto } from './dto/edit-message.dto';
import { ReactMessageDto } from './dto/react-message.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { PUBLIC_USER_SELECT } from '../users/public-user';

function directKeyOf(userAId: string, userBId: string): string {
  return [userAId, userBId].sort().join(':');
}

@Injectable()
export class DirectMessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly friends: FriendsService,
    private readonly notifications: NotificationsService,
    private readonly storage: StorageService,
  ) {}

  /// Публичный метод (не private): используется также DirectMessagesGateway
  /// для проверки членства перед join комнаты/typing-событиями без повторного
  /// запроса полной беседы.
  async requireMember(userId: string, conversationId: string) {
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!member) {
      throw new NotFoundException('Беседа не найдена');
    }
    return member;
  }

  async listConversations(userId: string) {
    const memberships = await this.prisma.conversationMember.findMany({
      where: { userId },
      include: {
        conversation: {
          include: {
            members: { include: { user: { select: PUBLIC_USER_SELECT } } },
            messages: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
      },
      orderBy: { conversation: { lastMessageAt: 'desc' } },
    });

    return Promise.all(
      memberships.map(async (m) => {
        const unreadCount = await this.prisma.directMessage.count({
          where: {
            conversationId: m.conversationId,
            createdAt: { gt: m.lastReadAt },
            senderId: { not: userId },
            isDeleted: false,
          },
        });
        return {
          id: m.conversation.id,
          type: m.conversation.type,
          title: m.conversation.title,
          avatar: this.storage.publicUrl(m.conversation.avatar),
          members: m.conversation.members.map((cm) => cm.user),
          lastMessage: m.conversation.messages[0] ?? null,
          lastMessageAt: m.conversation.lastMessageAt,
          unreadCount,
          isMuted: m.isMuted,
          isArchived: m.isArchived,
        };
      }),
    );
  }

  async createDirectConversation(
    userId: string,
    dto: CreateDirectConversationDto,
  ) {
    const target = await this.prisma.user.findFirst({
      where: { username: { equals: dto.username, mode: 'insensitive' } },
    });
    if (!target) {
      throw new NotFoundException('Пользователь не найден');
    }
    if (target.id === userId) {
      throw new ForbiddenException('Нельзя создать переписку с самим собой');
    }

    if (target.directMessagePolicy === 'NOBODY') {
      throw new ForbiddenException(
        'Пользователь не принимает личные сообщения',
      );
    }
    if (target.directMessagePolicy === 'FRIENDS') {
      const isFriend = await this.friends.isFriend(userId, target.id);
      if (!isFriend) {
        throw new ForbiddenException(
          'Пользователь принимает сообщения только от друзей',
        );
      }
    }
    if (target.directMessagePolicy === 'FRIENDS_OF_FRIENDS') {
      const ok = await this.friends.areFriendsOfFriends(userId, target.id);
      if (!ok) {
        throw new ForbiddenException(
          'Пользователь принимает сообщения только от друзей своих друзей',
        );
      }
    }

    const directKey = directKeyOf(userId, target.id);
    const existing = await this.prisma.conversation.findUnique({
      where: { directKey },
    });
    if (existing) {
      return this.prisma.conversation.findUniqueOrThrow({
        where: { id: existing.id },
        include: {
          members: { include: { user: { select: PUBLIC_USER_SELECT } } },
        },
      });
    }

    return this.prisma.conversation.create({
      data: {
        type: ConversationType.DIRECT,
        directKey,
        createdById: userId,
        members: {
          create: [
            { userId, role: ConversationRole.MEMBER },
            { userId: target.id, role: ConversationRole.MEMBER },
          ],
        },
      },
      include: {
        members: { include: { user: { select: PUBLIC_USER_SELECT } } },
      },
    });
  }

  async createGroupConversation(
    userId: string,
    dto: CreateGroupConversationDto,
  ) {
    const members = await this.prisma.user.findMany({
      where: { username: { in: dto.memberUsernames, mode: 'insensitive' } },
    });
    const memberIds = Array.from(
      new Set([userId, ...members.map((m) => m.id)]),
    );

    return this.prisma.conversation.create({
      data: {
        type: ConversationType.GROUP,
        title: dto.title,
        createdById: userId,
        members: {
          create: memberIds.map((id) => ({
            userId: id,
            role:
              id === userId ? ConversationRole.OWNER : ConversationRole.MEMBER,
          })),
        },
      },
      include: {
        members: { include: { user: { select: PUBLIC_USER_SELECT } } },
      },
    });
  }

  async getConversation(userId: string, conversationId: string) {
    await this.requireMember(userId, conversationId);
    return this.prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
      include: {
        members: { include: { user: { select: PUBLIC_USER_SELECT } } },
      },
    });
  }

  async listMessages(
    userId: string,
    conversationId: string,
    page: number,
    limit: number,
  ) {
    await this.requireMember(userId, conversationId);
    const [items, total] = await Promise.all([
      this.prisma.directMessage.findMany({
        where: { conversationId },
        include: { sender: { select: PUBLIC_USER_SELECT }, reactions: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.directMessage.count({ where: { conversationId } }),
    ]);
    return { items: items.reverse(), total, page, limit };
  }

  async sendMessage(
    userId: string,
    conversationId: string,
    dto: SendMessageDto,
  ) {
    await this.requireMember(userId, conversationId);

    if (dto.parentId) {
      const parent = await this.prisma.directMessage.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent || parent.conversationId !== conversationId) {
        throw new NotFoundException(
          'Сообщение, на которое вы отвечаете, не найдено',
        );
      }
    }

    const [message] = await this.prisma.$transaction([
      this.prisma.directMessage.create({
        data: {
          conversationId,
          senderId: userId,
          content: dto.content,
          contentHtml: escapeToHtml(dto.content),
          parentId: dto.parentId,
        },
        include: { sender: { select: PUBLIC_USER_SELECT } },
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
      }),
    ]);

    await this.notifyRecipients(userId, conversationId, message);

    return message;
  }

  private async notifyRecipients(
    senderId: string,
    conversationId: string,
    message: {
      id: string;
      content: string;
      sender: { username: string } | null;
    },
  ): Promise<void> {
    const members = await this.prisma.conversationMember.findMany({
      where: { conversationId, userId: { not: senderId }, isMuted: false },
    });
    const senderName = message.sender?.username ?? 'Пользователь';
    await Promise.all(
      members.map((member) =>
        this.notifications.create({
          userId: member.userId,
          type: 'MESSAGE_RECEIVED',
          title: `Новое сообщение от ${senderName}`,
          message: message.content.slice(0, 200),
          link: `/messages/${conversationId}`,
          fromUserId: senderId,
          // Для push: одна беседа — одна группа в системе (без дублей).
          metadata: { conversationId, messageId: message.id },
        }),
      ),
    );
  }

  async editMessage(userId: string, messageId: string, dto: EditMessageDto) {
    const message = await this.prisma.directMessage.findUnique({
      where: { id: messageId },
    });
    if (!message || message.isDeleted) {
      throw new NotFoundException('Сообщение не найдено');
    }
    if (message.senderId !== userId) {
      throw new ForbiddenException('Редактировать можно только свои сообщения');
    }
    return this.prisma.directMessage.update({
      where: { id: messageId },
      data: {
        content: dto.content,
        contentHtml: escapeToHtml(dto.content),
        isEdited: true,
        editedAt: new Date(),
      },
    });
  }

  async deleteMessage(userId: string, messageId: string) {
    const message = await this.prisma.directMessage.findUnique({
      where: { id: messageId },
    });
    if (!message || message.isDeleted) {
      throw new NotFoundException('Сообщение не найдено');
    }
    if (message.senderId !== userId) {
      throw new ForbiddenException('Удалить можно только свои сообщения');
    }
    return this.prisma.directMessage.update({
      where: { id: messageId },
      data: { isDeleted: true, deletedAt: new Date() },
    });
  }

  /// DirectMessageReaction уникальна по (messageId, userId, emoji) — в отличие
  /// от CommentReaction, один пользователь может поставить НЕСКОЛЬКО разных
  /// emoji на одно сообщение одновременно; toggle переключает только тот же emoji.
  async react(userId: string, messageId: string, dto: ReactMessageDto) {
    const message = await this.prisma.directMessage.findUnique({
      where: { id: messageId },
    });
    if (!message || message.isDeleted) {
      throw new NotFoundException('Сообщение не найдено');
    }
    const existing = await this.prisma.directMessageReaction.findUnique({
      where: {
        messageId_userId_emoji: { messageId, userId, emoji: dto.emoji },
      },
    });
    if (existing) {
      await this.prisma.directMessageReaction.delete({
        where: { id: existing.id },
      });
      return {
        reacted: false,
        emoji: dto.emoji,
        conversationId: message.conversationId,
      };
    }
    await this.prisma.directMessageReaction.create({
      data: { messageId, userId, emoji: dto.emoji },
    });
    return {
      reacted: true,
      emoji: dto.emoji,
      conversationId: message.conversationId,
    };
  }

  async markRead(userId: string, conversationId: string) {
    await this.requireMember(userId, conversationId);
    const latest = await this.prisma.directMessage.findFirst({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
    });
    await this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: new Date(), lastReadMessageId: latest?.id ?? null },
    });
    return { success: true };
  }

  async leave(userId: string, conversationId: string): Promise<void> {
    await this.requireMember(userId, conversationId);
    await this.prisma.conversationMember.deleteMany({
      where: { conversationId, userId },
    });
  }

  async createInvite(
    userId: string,
    conversationId: string,
    dto: CreateInviteDto,
  ) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) {
      throw new NotFoundException('Беседа не найдена');
    }
    if (conversation.type !== ConversationType.GROUP) {
      throw new ForbiddenException(
        'Приглашения доступны только для групповых бесед',
      );
    }
    await this.requireMember(userId, conversationId);

    return this.prisma.groupInvite.create({
      data: {
        conversationId,
        code: randomBytes(16).toString('hex'),
        createdById: userId,
        maxUses: dto.maxUses,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      },
    });
  }

  async getInvite(code: string) {
    const invite = await this.prisma.groupInvite.findUnique({
      where: { code },
      include: { conversation: true },
    });
    if (!invite || invite.revokedAt) {
      throw new NotFoundException('Приглашение не найдено');
    }
    return invite;
  }

  async joinViaInvite(userId: string, code: string) {
    const invite = await this.getInvite(code);
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      throw new ForbiddenException('Приглашение истекло');
    }
    if (invite.maxUses !== null && invite.usedCount >= invite.maxUses) {
      throw new ForbiddenException('Приглашение исчерпано');
    }

    const existing = await this.prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId: invite.conversationId,
          userId,
        },
      },
    });
    if (existing) {
      throw new ConflictException('Вы уже состоите в этой беседе');
    }

    await this.prisma.$transaction([
      this.prisma.conversationMember.create({
        data: {
          conversationId: invite.conversationId,
          userId,
          role: ConversationRole.MEMBER,
        },
      }),
      this.prisma.groupInvite.update({
        where: { id: invite.id },
        data: { usedCount: { increment: 1 } },
      }),
    ]);

    return this.getConversation(userId, invite.conversationId);
  }

  async revokeInvite(userId: string, code: string): Promise<void> {
    const invite = await this.getInvite(code);
    await this.requireMember(userId, invite.conversationId);
    await this.prisma.groupInvite.update({
      where: { id: invite.id },
      data: { revokedAt: new Date() },
    });
  }
}
