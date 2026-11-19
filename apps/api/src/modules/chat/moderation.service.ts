import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  PermissionService,
  SanctionRevokeDecision,
  sanctionRevokeAuditChanges,
} from '../roles/permission.service';
import { PUBLIC_USER_SELECT } from '../users/public-user';
import { BanUserDto } from './dto/ban-user.dto';
import { CreateChannelDto } from './dto/create-channel.dto';
import { MuteUserDto } from './dto/mute-user.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';

@Injectable()
export class ModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
    private readonly audit: AuditService,
  ) {}

  /// Иерархия: нельзя применять мут/бан к себе, SYSTEM-аккаунту и цели с
  /// равным или более высоким приоритетом (canActOn). Текст ошибки общий —
  /// не раскрывает роли цели.
  private async assertCanModerate(
    actorId: string,
    targetUserId: string,
  ): Promise<void> {
    if (
      actorId === targetUserId ||
      !(await this.permissions.canActOn(actorId, targetUserId))
    ) {
      throw new ForbiddenException(
        'Недостаточно прав для действия над этим пользователем',
      );
    }
  }

  /// Снятие мута/бана (Q25, Q48, Q49; ADR-0171, ADR-0173): единое правило
  /// PermissionService.assertCanRevokeSanction (владелец всегда; неизвестный
  /// выдавший — только владелец; с себя чужую — нельзя; выдавший; равный или
  /// старший). Каждое снятие пишется в журнал аудита.
  private assertCanRevoke(
    actorId: string,
    targetUserId: string,
    issuerId: string | null,
  ): Promise<SanctionRevokeDecision> {
    return this.permissions.assertCanRevokeSanction(
      actorId,
      issuerId,
      targetUserId,
    );
  }

  private async auditRevoke(
    actorId: string,
    decision: SanctionRevokeDecision,
    issuerId: string | null,
    entry: { action: string; targetType: string; targetId: string },
    userId: string,
  ): Promise<void> {
    await this.audit.log({
      actorId,
      ...entry,
      changes: sanctionRevokeAuditChanges(decision, issuerId, { userId }),
      severity: 'warning',
    });
  }

  async createChannel(dto: CreateChannelDto) {
    const existing = await this.prisma.chatChannel.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException('Канал с таким slug уже существует');
    }
    return this.prisma.chatChannel.create({ data: dto });
  }

  async updateChannel(id: string, dto: UpdateChannelDto) {
    const channel = await this.prisma.chatChannel.findUnique({ where: { id } });
    if (!channel) {
      throw new NotFoundException('Канал не найден');
    }
    return this.prisma.chatChannel.update({ where: { id }, data: dto });
  }

  async removeChannel(id: string): Promise<void> {
    const channel = await this.prisma.chatChannel.findUnique({ where: { id } });
    if (!channel) {
      throw new NotFoundException('Канал не найден');
    }
    await this.prisma.chatChannel.delete({ where: { id } });
  }

  async muteUser(mutedBy: string, dto: MuteUserDto) {
    await this.assertCanModerate(mutedBy, dto.userId);
    return this.prisma.chatMute.create({
      data: {
        userId: dto.userId,
        channelId: dto.channelId,
        reason: dto.reason,
        reasonNote: dto.reasonNote,
        mutedBy,
        mutedUntil: dto.mutedUntil ? new Date(dto.mutedUntil) : undefined,
      },
    });
  }

  async listMutes(onlyActive = true) {
    const where: Prisma.ChatMuteWhereInput = onlyActive
      ? { isActive: true }
      : {};
    return this.prisma.chatMute.findMany({
      where,
      // Персоналу — только публичные поля пользователя (ADR-0132, ADR-0107).
      include: { user: { select: PUBLIC_USER_SELECT } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async unmute(actorId: string, id: string): Promise<void> {
    const mute = await this.prisma.chatMute.findUnique({ where: { id } });
    if (!mute) {
      throw new NotFoundException('Мут не найден');
    }
    const decision = await this.assertCanRevoke(
      actorId,
      mute.userId,
      mute.mutedBy,
    );
    await this.prisma.chatMute.update({
      where: { id },
      data: { isActive: false },
    });
    await this.auditRevoke(
      actorId,
      decision,
      mute.mutedBy,
      { action: 'chat.mute.revoke', targetType: 'ChatMute', targetId: id },
      mute.userId,
    );
  }

  async banUser(bannedBy: string, dto: BanUserDto) {
    await this.assertCanModerate(bannedBy, dto.userId);
    return this.prisma.chatBan.create({
      data: {
        userId: dto.userId,
        reason: dto.reason,
        bannedBy,
        bannedUntil: dto.bannedUntil ? new Date(dto.bannedUntil) : undefined,
      },
    });
  }

  async listBans(onlyActive = true) {
    const where: Prisma.ChatBanWhereInput = onlyActive
      ? { isActive: true }
      : {};
    return this.prisma.chatBan.findMany({
      where,
      // Персоналу — только публичные поля пользователя (ADR-0132, ADR-0107).
      include: { user: { select: PUBLIC_USER_SELECT } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async unban(actorId: string, id: string): Promise<void> {
    const ban = await this.prisma.chatBan.findUnique({ where: { id } });
    if (!ban) {
      throw new NotFoundException('Бан не найден');
    }
    const decision = await this.assertCanRevoke(
      actorId,
      ban.userId,
      ban.bannedBy,
    );
    await this.prisma.chatBan.update({
      where: { id },
      data: { isActive: false },
    });
    await this.auditRevoke(
      actorId,
      decision,
      ban.bannedBy,
      { action: 'chat.ban.revoke', targetType: 'ChatBan', targetId: id },
      ban.userId,
    );
  }

  async searchMessages(query: string, page: number, limit: number) {
    const [items, total] = await Promise.all([
      this.prisma.chatMessage.findMany({
        where: { content: { contains: query, mode: 'insensitive' } },
        include: { author: { select: PUBLIC_USER_SELECT }, channel: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.chatMessage.count({
        where: { content: { contains: query, mode: 'insensitive' } },
      }),
    ]);
    return { items, total, page, limit };
  }

  async getMessageById(id: string) {
    const message = await this.prisma.chatMessage.findUnique({
      where: { id },
      include: { author: { select: PUBLIC_USER_SELECT }, channel: true },
    });
    if (!message) {
      throw new NotFoundException('Сообщение не найдено');
    }
    return message;
  }
}
