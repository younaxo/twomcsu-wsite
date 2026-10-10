import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FriendshipStatus } from '@prisma/client';
import { StorageService } from '../files/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { resolveUserIdByHandle } from '../profiles/handle';
import { PUBLIC_USER_SELECT, type PublicUser } from '../users/public-user';

/// Ответы друзей — зеркало контракта `@twomc/shared` (api/friends.ts). API не
/// импортирует shared (исходники TS сломали бы раскладку dist/), поэтому типы
/// дублируются здесь; e2e `social` проверяет форму.
export interface FriendUserDto {
  id: string;
  username: string;
  tag: string;
  avatar: string | null;
}
export interface FriendDto {
  user: FriendUserDto;
  since: string | null;
}
export interface FriendRequestDto {
  id: string;
  createdAt: string;
  user: FriendUserDto;
}
export interface BlockedUserDto {
  user: FriendUserDto;
  blockedAt: string;
}
export interface FriendRelationDto {
  userId: string;
  status: 'SELF' | 'NONE' | 'FRIENDS' | 'OUTGOING' | 'INCOMING' | 'BLOCKED';
  requestId: string | null;
}

@Injectable()
export class FriendsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly storage: StorageService,
  ) {}

  /// Пользователь в списках друзей — только публичные поля (ADR-0107/0108).
  private toUser(user: PublicUser): FriendUserDto {
    return {
      id: user.id,
      username: user.username,
      tag: user.tag,
      avatar: this.storage.publicUrl(user.avatar),
    };
  }

  private async findBetween(userAId: string, userBId: string) {
    return this.prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: userAId, addresseeId: userBId },
          { requesterId: userBId, addresseeId: userAId },
        ],
      },
    });
  }

  async isFriend(userAId: string, userBId: string): Promise<boolean> {
    const friendship = await this.findBetween(userAId, userBId);
    return friendship?.status === FriendshipStatus.ACCEPTED;
  }

  async areFriendsOfFriends(
    userAId: string,
    userBId: string,
  ): Promise<boolean> {
    const aFriends = await this.prisma.friendship.findMany({
      where: {
        status: FriendshipStatus.ACCEPTED,
        OR: [{ requesterId: userAId }, { addresseeId: userAId }],
      },
    });
    const aFriendIds = new Set(
      aFriends.map((f) =>
        f.requesterId === userAId ? f.addresseeId : f.requesterId,
      ),
    );
    if (aFriendIds.size === 0) {
      return false;
    }
    const mutual = await this.prisma.friendship.findFirst({
      where: {
        status: FriendshipStatus.ACCEPTED,
        OR: [
          { requesterId: userBId, addresseeId: { in: [...aFriendIds] } },
          { addresseeId: userBId, requesterId: { in: [...aFriendIds] } },
        ],
      },
    });
    return mutual !== null;
  }

  async sendRequest(requesterId: string, targetUsername: string) {
    const target = await this.prisma.user.findFirst({
      where: { username: { equals: targetUsername, mode: 'insensitive' } },
    });
    if (!target) {
      throw new NotFoundException('Пользователь не найден');
    }
    if (target.id === requesterId) {
      throw new ForbiddenException(
        'Нельзя отправить заявку в друзья самому себе',
      );
    }

    const existing = await this.findBetween(requesterId, target.id);
    if (existing) {
      if (existing.status === FriendshipStatus.BLOCKED) {
        throw new ForbiddenException('Невозможно отправить заявку');
      }
      if (existing.status === FriendshipStatus.ACCEPTED) {
        throw new ConflictException('Вы уже друзья');
      }
      if (existing.status === FriendshipStatus.PENDING) {
        throw new ConflictException(
          existing.requesterId === requesterId
            ? 'Заявка уже отправлена'
            : 'У вас уже есть входящая заявка от этого пользователя — примите её',
        );
      }
    }

    if (target.friendRequestPolicy === 'NOBODY') {
      throw new ForbiddenException('Пользователь не принимает заявки в друзья');
    }
    if (target.friendRequestPolicy === 'FRIENDS_OF_FRIENDS') {
      const ok = await this.areFriendsOfFriends(requesterId, target.id);
      if (!ok) {
        throw new ForbiddenException(
          'Пользователь принимает заявки только от друзей своих друзей',
        );
      }
    }

    const created = await this.prisma.friendship.create({
      data: {
        requesterId,
        addresseeId: target.id,
        status: FriendshipStatus.PENDING,
      },
    });

    if (target.notifyOnFriendRequest) {
      const requester = await this.prisma.user.findUnique({
        where: { id: requesterId },
      });
      if (requester) {
        await this.notifications.create({
          userId: target.id,
          type: 'FRIEND_REQUEST',
          title: `${requester.username} хочет добавить вас в друзья`,
          link: '/friends?tab=incoming',
          fromUserId: requester.id,
        });
      }
    }

    return created;
  }

  async acceptRequest(userId: string, friendshipId: string) {
    const friendship = await this.prisma.friendship.findUnique({
      where: { id: friendshipId },
    });
    if (!friendship || friendship.addresseeId !== userId) {
      throw new NotFoundException('Заявка не найдена');
    }
    if (friendship.status !== FriendshipStatus.PENDING) {
      throw new ConflictException('Заявка уже обработана');
    }

    const updated = await this.prisma.friendship.update({
      where: { id: friendshipId },
      data: { status: FriendshipStatus.ACCEPTED, acceptedAt: new Date() },
    });

    // Запись в ленту — по настройкам ленты отправителя заявки (ADR-0114):
    // «показывать дружбу» и её видимость.
    const feed = await this.prisma.activityFeedSettings.findUnique({
      where: { userId: friendship.requesterId },
      select: { showFriendships: true, friendshipsVisibility: true },
    });
    if (feed?.showFriendships !== false) {
      await this.prisma.activity.create({
        data: {
          userId: friendship.requesterId,
          type: 'FRIENDSHIP_STARTED',
          title: 'Новая дружба',
          visibility: feed?.friendshipsVisibility ?? 'FRIENDS',
          metadata: { friendId: friendship.addresseeId },
        },
      });
    }

    const requesterSettings = await this.prisma.user.findUnique({
      where: { id: friendship.requesterId },
    });
    if (requesterSettings?.notifyOnFriendRequest) {
      const addressee = await this.prisma.user.findUnique({
        where: { id: userId },
      });
      if (addressee) {
        await this.notifications.create({
          userId: friendship.requesterId,
          type: 'FRIEND_ACCEPTED',
          title: `${addressee.username} принял(а) вашу заявку в друзья`,
          link: `/u/${encodeURIComponent(addressee.username)}`,
          fromUserId: addressee.id,
        });
      }
    }

    return updated;
  }

  /// Работает и со стороны адресата (отклонить входящую), и со стороны
  /// отправителя (отменить исходящую) — одна заявка, оба действия эквивалентны.
  async removeRequest(userId: string, friendshipId: string): Promise<void> {
    const friendship = await this.prisma.friendship.findUnique({
      where: { id: friendshipId },
    });
    if (
      !friendship ||
      (friendship.requesterId !== userId && friendship.addresseeId !== userId)
    ) {
      throw new NotFoundException('Заявка не найдена');
    }
    if (friendship.status !== FriendshipStatus.PENDING) {
      throw new ConflictException('Заявка уже обработана');
    }
    await this.prisma.friendship.delete({ where: { id: friendshipId } });
  }

  async removeFriend(userId: string, otherUserId: string): Promise<void> {
    const friendship = await this.findBetween(userId, otherUserId);
    if (!friendship || friendship.status !== FriendshipStatus.ACCEPTED) {
      throw new NotFoundException('Дружба не найдена');
    }
    await this.prisma.friendship.delete({ where: { id: friendship.id } });
  }

  /// Блокировка: снимает дружбу и заявки между игроками, но НЕ чужую блокировку —
  /// если другой игрок уже заблокировал меня, его блок остаётся, мой добавляется
  /// рядом (уникальна упорядоченная пара). Повторная блокировка — без изменений.
  async block(userId: string, targetUserId: string): Promise<void> {
    if (userId === targetUserId) {
      throw new ForbiddenException('Нельзя заблокировать самого себя');
    }
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });
    if (!target) {
      throw new NotFoundException('Пользователь не найден');
    }
    const rows = await this.prisma.friendship.findMany({
      where: {
        OR: [
          { requesterId: userId, addresseeId: targetUserId },
          { requesterId: targetUserId, addresseeId: userId },
        ],
      },
    });
    const mine = rows.find(
      (row) =>
        row.requesterId === userId && row.status === FriendshipStatus.BLOCKED,
    );
    if (mine) return;
    const removable = rows.filter(
      (row) => row.status !== FriendshipStatus.BLOCKED,
    );
    await this.prisma.$transaction([
      ...removable.map((row) =>
        this.prisma.friendship.delete({ where: { id: row.id } }),
      ),
      this.prisma.friendship.create({
        data: {
          requesterId: userId,
          addresseeId: targetUserId,
          status: FriendshipStatus.BLOCKED,
        },
      }),
    ]);
  }

  async unblock(userId: string, targetUserId: string): Promise<void> {
    await this.prisma.friendship.deleteMany({
      where: {
        requesterId: userId,
        addresseeId: targetUserId,
        status: FriendshipStatus.BLOCKED,
      },
    });
  }

  async listFriends(userId: string): Promise<FriendDto[]> {
    const rows = await this.prisma.friendship.findMany({
      where: {
        status: FriendshipStatus.ACCEPTED,
        OR: [{ requesterId: userId }, { addresseeId: userId }],
      },
      include: {
        requester: { select: PUBLIC_USER_SELECT },
        addressee: { select: PUBLIC_USER_SELECT },
      },
      orderBy: { acceptedAt: 'desc' },
    });
    return rows.map((row) => ({
      user: this.toUser(
        row.requesterId === userId ? row.addressee : row.requester,
      ),
      since: row.acceptedAt?.toISOString() ?? null,
    }));
  }

  async listIncomingRequests(userId: string): Promise<FriendRequestDto[]> {
    const rows = await this.prisma.friendship.findMany({
      where: { addresseeId: userId, status: FriendshipStatus.PENDING },
      include: { requester: { select: PUBLIC_USER_SELECT } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      user: this.toUser(row.requester),
    }));
  }

  async listOutgoingRequests(userId: string): Promise<FriendRequestDto[]> {
    const rows = await this.prisma.friendship.findMany({
      where: { requesterId: userId, status: FriendshipStatus.PENDING },
      include: { addressee: { select: PUBLIC_USER_SELECT } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      user: this.toUser(row.addressee),
    }));
  }

  async incomingCount(userId: string): Promise<number> {
    return this.prisma.friendship.count({
      where: { addresseeId: userId, status: FriendshipStatus.PENDING },
    });
  }

  async listBlocked(userId: string): Promise<BlockedUserDto[]> {
    const rows = await this.prisma.friendship.findMany({
      where: { requesterId: userId, status: FriendshipStatus.BLOCKED },
      include: { addressee: { select: PUBLIC_USER_SELECT } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => ({
      user: this.toUser(row.addressee),
      blockedAt: row.createdAt.toISOString(),
    }));
  }

  /// Отношение зрителя к игроку по адресу профиля (ник, alias, Minecraft-ник) —
  /// для кнопки «В друзья». Чужая блокировка не раскрывается (`NONE`).
  async relation(viewerId: string, handle: string): Promise<FriendRelationDto> {
    const targetId = await resolveUserIdByHandle(this.prisma, handle);
    if (!targetId) {
      throw new NotFoundException('Пользователь не найден');
    }
    if (targetId === viewerId) {
      return { userId: targetId, status: 'SELF', requestId: null };
    }
    const rows = await this.prisma.friendship.findMany({
      where: {
        OR: [
          { requesterId: viewerId, addresseeId: targetId },
          { requesterId: targetId, addresseeId: viewerId },
        ],
      },
    });
    const none: FriendRelationDto = {
      userId: targetId,
      status: 'NONE',
      requestId: null,
    };
    const blocked = rows.filter(
      (row) => row.status === FriendshipStatus.BLOCKED,
    );
    if (blocked.some((row) => row.requesterId === viewerId)) {
      return { ...none, status: 'BLOCKED' };
    }
    if (blocked.length > 0) return none;
    if (rows.some((row) => row.status === FriendshipStatus.ACCEPTED)) {
      return { ...none, status: 'FRIENDS' };
    }
    const pending = rows.find((row) => row.status === FriendshipStatus.PENDING);
    if (pending) {
      return {
        userId: targetId,
        status: pending.requesterId === viewerId ? 'OUTGOING' : 'INCOMING',
        requestId: pending.id,
      };
    }
    return none;
  }
}
