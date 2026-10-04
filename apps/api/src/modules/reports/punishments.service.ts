import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IssuePunishmentDto } from './dto/issue-punishment.dto';
import { UpdatePunishmentDto } from './dto/update-punishment.dto';

@Injectable()
export class PunishmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async listMyPunishments(userId: string) {
    return this.prisma.userPunishment.findMany({
      where: { userId },
      orderBy: { issuedAt: 'desc' },
    });
  }

  private async requireUserByUsername(username: string) {
    const user = await this.prisma.user.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
    });
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }
    return user;
  }

  async listByUsername(username: string) {
    const user = await this.requireUserByUsername(username);
    return this.prisma.userPunishment.findMany({
      where: { userId: user.id },
      orderBy: { issuedAt: 'desc' },
    });
  }

  async issuePunishment(
    targetUserId: string,
    issuedBy: string,
    dto: IssuePunishmentDto,
  ) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });
    if (!target) {
      throw new NotFoundException('Пользователь не найден');
    }
    return this.prisma.userPunishment.create({
      data: {
        userId: targetUserId,
        punishmentType: dto.punishmentType,
        reason: dto.reason,
        duration: dto.duration,
        server: dto.server,
        issuedBy,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        isAppealable: dto.isAppealable ?? true,
      },
    });
  }

  async updatePunishment(
    targetUserId: string,
    id: string,
    dto: UpdatePunishmentDto,
  ) {
    const punishment = await this.prisma.userPunishment.findUnique({
      where: { id },
    });
    if (!punishment || punishment.userId !== targetUserId) {
      throw new NotFoundException('Наказание не найдено');
    }
    return this.prisma.userPunishment.update({
      where: { id },
      data: {
        ...(dto.reason !== undefined ? { reason: dto.reason } : {}),
        ...(dto.expiresAt !== undefined
          ? { expiresAt: new Date(dto.expiresAt) }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.isAppealable !== undefined
          ? { isAppealable: dto.isAppealable }
          : {}),
      },
    });
  }
}
