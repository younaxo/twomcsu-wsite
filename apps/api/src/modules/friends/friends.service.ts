import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FriendshipStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FriendsService {
  constructor(private readonly prisma: PrismaService) {}

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

    return this.prisma.friendship.create({
      data: {
        requesterId,
        addresseeId: target.id,
        status: FriendshipStatus.PENDING,
      },
    });
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

    await this.prisma.activity.create({
      data: {
        userId: friendship.requesterId,
        type: 'FRIENDSHIP_STARTED',
        title: 'Новая дружба',
        visibility: 'FRIENDS',
        metadata: { friendId: friendship.addresseeId },
      },
    });

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

  async block(userId: string, targetUserId: string): Promise<void> {
    if (userId === targetUserId) {
      throw new ForbiddenException('Нельзя заблокировать самого себя');
    }
    const existing = await this.findBetween(userId, targetUserId);
    if (existing) {
      await this.prisma.friendship.delete({ where: { id: existing.id } });
    }
    await this.prisma.friendship.create({
      data: {
        requesterId: userId,
        addresseeId: targetUserId,
        status: FriendshipStatus.BLOCKED,
      },
    });
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

  async listFriends(userId: string) {
    const rows = await this.prisma.friendship.findMany({
      where: {
        status: FriendshipStatus.ACCEPTED,
        OR: [{ requesterId: userId }, { addresseeId: userId }],
      },
      include: { requester: true, addressee: true },
      orderBy: { acceptedAt: 'desc' },
    });
    return rows.map((f) =>
      f.requesterId === userId ? f.addressee : f.requester,
    );
  }

  async listIncomingRequests(userId: string) {
    return this.prisma.friendship.findMany({
      where: { addresseeId: userId, status: FriendshipStatus.PENDING },
      include: { requester: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listOutgoingRequests(userId: string) {
    return this.prisma.friendship.findMany({
      where: { requesterId: userId, status: FriendshipStatus.PENDING },
      include: { addressee: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async incomingCount(userId: string): Promise<number> {
    return this.prisma.friendship.count({
      where: { addresseeId: userId, status: FriendshipStatus.PENDING },
    });
  }

  async listBlocked(userId: string) {
    return this.prisma.friendship.findMany({
      where: { requesterId: userId, status: FriendshipStatus.BLOCKED },
      include: { addressee: true },
    });
  }
}
