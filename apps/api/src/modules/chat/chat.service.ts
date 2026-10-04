import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChatBan } from '@prisma/client';
import { escapeToHtml, extractMentions } from '../../common/html.util';
import { NotificationsService } from '../notifications/notifications.service';
import { PermissionService } from '../roles/permission.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SendMessageDto } from './dto/send-message.dto';
import { EditMessageDto } from './dto/edit-message.dto';

function onlineKey(channelId: string): string {
  return `chat:online:${channelId}`;
}

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly permissions: PermissionService,
    private readonly notifications: NotificationsService,
  ) {}

  async listActiveChannels() {
    return this.prisma.chatChannel.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' },
    });
  }

  async getChannelBySlug(slug: string) {
    const channel = await this.prisma.chatChannel.findUnique({
      where: { slug },
    });
    if (!channel || !channel.isActive) {
      throw new NotFoundException('Канал не найден');
    }
    return channel;
  }

  /// Используется гейтвеем (channelId из socket-события) — тот же 404, что и
  /// при обращении по slug: несуществующий/отключённый канал не отличается
  /// внешне от просто отсутствующего.
  async requireActiveChannel(channelId: string) {
    const channel = await this.prisma.chatChannel.findUnique({
      where: { id: channelId },
    });
    if (!channel || !channel.isActive) {
      throw new NotFoundException('Канал не найден');
    }
    return channel;
  }

  async listMessages(slug: string, page: number, limit: number) {
    const channel = await this.getChannelBySlug(slug);
    const [items, total] = await Promise.all([
      this.prisma.chatMessage.findMany({
        where: { channelId: channel.id, isDeleted: false },
        include: { author: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.chatMessage.count({
        where: { channelId: channel.id, isDeleted: false },
      }),
    ]);
    return { items: items.reverse(), total, page, limit };
  }

  async getPinned(slug: string) {
    const channel = await this.getChannelBySlug(slug);
    return this.prisma.chatMessage.findMany({
      where: { channelId: channel.id, isPinned: true, isDeleted: false },
      include: { author: true },
      orderBy: { pinnedAt: 'desc' },
    });
  }

  async getOnlineUserIds(channelId: string): Promise<string[]> {
    return this.redis.client.smembers(onlineKey(channelId));
  }

  async markOnline(channelId: string, userId: string): Promise<void> {
    await this.redis.client.sadd(onlineKey(channelId), userId);
  }

  async markOffline(channelId: string, userId: string): Promise<void> {
    await this.redis.client.srem(onlineKey(channelId), userId);
  }

  /// Активный бан в чате блокирует join/send для ЛЮБОГО канала — ChatBan в
  /// схеме не привязан к конкретному каналу (в отличие от ChatMute).
  async requireNotChatBanned(userId: string): Promise<void> {
    const ban = await this.findActiveBan(userId);
    if (ban) {
      throw new ForbiddenException('Вы забанены в чате');
    }
  }

  async findActiveBan(userId: string): Promise<ChatBan | null> {
    const ban = await this.prisma.chatBan.findFirst({
      where: {
        userId,
        isActive: true,
        OR: [{ bannedUntil: null }, { bannedUntil: { gt: new Date() } }],
      },
    });
    return ban;
  }

  async requireNotMuted(userId: string, channelId: string): Promise<void> {
    const mute = await this.prisma.chatMute.findFirst({
      where: {
        userId,
        isActive: true,
        OR: [{ channelId: null }, { channelId }],
        AND: [
          { OR: [{ mutedUntil: null }, { mutedUntil: { gt: new Date() } }] },
        ],
      },
    });
    if (mute) {
      throw new ForbiddenException('Вы в муте в этом канале');
    }
  }

  async sendMessage(userId: string, channelId: string, dto: SendMessageDto) {
    const channel = await this.requireActiveChannel(channelId);
    await this.requireNotChatBanned(userId);
    await this.requireNotMuted(userId, channelId);

    if (channel.isReadOnly) {
      const canPostReadonly = await this.permissions.hasPermission(
        userId,
        'chat.messages.post_readonly',
      );
      if (!canPostReadonly) {
        throw new ForbiddenException('Канал доступен только для чтения');
      }
    }

    if (dto.parentId) {
      const parent = await this.prisma.chatMessage.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent || parent.channelId !== channelId) {
        throw new NotFoundException(
          'Сообщение, на которое вы отвечаете, не найдено',
        );
      }
    }

    const mentions = extractMentions(dto.content);
    const created = await this.prisma.chatMessage.create({
      data: {
        channelId,
        authorId: userId,
        content: dto.content,
        contentHtml: escapeToHtml(dto.content),
        mentions,
        parentId: dto.parentId,
      },
      include: { author: true },
    });

    await this.notifyMentioned(created.author, channelId, mentions);

    return created;
  }

  private async notifyMentioned(
    author: { id: string; username: string } | null,
    channelId: string,
    mentions: string[],
  ): Promise<void> {
    if (!author) {
      return;
    }
    for (const username of mentions) {
      if (username.toLowerCase() === author.username.toLowerCase()) {
        continue;
      }
      const mentioned = await this.prisma.user.findFirst({
        where: { username: { equals: username, mode: 'insensitive' } },
      });
      if (mentioned?.notifyOnMention) {
        await this.notifications.create({
          userId: mentioned.id,
          type: 'CHAT_MENTION',
          title: `${author.username} упомянул(а) вас в чате`,
          link: `/chat/${channelId}`,
          fromUserId: author.id,
        });
      }
    }
  }

  async editMessage(userId: string, messageId: string, dto: EditMessageDto) {
    const message = await this.prisma.chatMessage.findUnique({
      where: { id: messageId },
    });
    if (!message || message.isDeleted) {
      throw new NotFoundException('Сообщение не найдено');
    }
    if (message.authorId !== userId) {
      throw new ForbiddenException('Редактировать можно только свои сообщения');
    }
    return this.prisma.chatMessage.update({
      where: { id: messageId },
      data: {
        content: dto.content,
        contentHtml: escapeToHtml(dto.content),
        mentions: extractMentions(dto.content),
        isEdited: true,
        editedAt: new Date(),
      },
    });
  }

  async deleteMessage(userId: string, messageId: string, reason?: string) {
    const message = await this.prisma.chatMessage.findUnique({
      where: { id: messageId },
    });
    if (!message || message.isDeleted) {
      throw new NotFoundException('Сообщение не найдено');
    }
    const isAuthor = message.authorId === userId;
    if (!isAuthor) {
      const canDelete = await this.permissions.hasPermission(
        userId,
        'chat.messages.delete',
      );
      if (!canDelete) {
        throw new ForbiddenException('Удалить можно только свои сообщения');
      }
    }
    return this.prisma.chatMessage.update({
      where: { id: messageId },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: userId,
        deletedReason: isAuthor ? null : (reason ?? null),
      },
    });
  }

  /// Безвозвратное удаление (в отличие от deleteMessage() — soft-delete с
  /// сохранением записи). Ответы (parentId) остаются — ChatMessage.parent
  /// использует onDelete: SetNull, не Cascade.
  async hardDeleteMessage(messageId: string): Promise<void> {
    const message = await this.prisma.chatMessage.findUnique({
      where: { id: messageId },
    });
    if (!message) {
      throw new NotFoundException('Сообщение не найдено');
    }
    await this.prisma.chatMessage.delete({ where: { id: messageId } });
  }

  async setPinned(userId: string, messageId: string, pinned: boolean) {
    const canPin = await this.permissions.hasPermission(
      userId,
      'chat.messages.pin',
    );
    if (!canPin) {
      throw new ForbiddenException(
        'Недостаточно прав для закрепления сообщений',
      );
    }
    const message = await this.prisma.chatMessage.findUnique({
      where: { id: messageId },
    });
    if (!message || message.isDeleted) {
      throw new NotFoundException('Сообщение не найдено');
    }
    return this.prisma.chatMessage.update({
      where: { id: messageId },
      data: pinned
        ? { isPinned: true, pinnedAt: new Date(), pinnedBy: userId }
        : { isPinned: false, pinnedAt: null, pinnedBy: null },
    });
  }
}
