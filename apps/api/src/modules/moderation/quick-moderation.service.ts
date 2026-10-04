import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PunishmentType } from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import { ChatService } from '../chat/chat.service';
import { CommentsService } from '../comments/comments.service';
import { PrismaService } from '../prisma/prisma.service';
import { BanUserDto } from './dto/ban-user.dto';
import { KickUserDto } from './dto/kick-user.dto';
import { MuteUserDto } from './dto/mute-user.dto';
import { WarnUserDto } from './dto/warn-user.dto';

@Injectable()
export class QuickModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly chat: ChatService,
    private readonly comments: CommentsService,
  ) {}

  private async requireUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }
    return user;
  }

  /// MUTE — только дисциплинарная запись в истории наказаний; не влияет
  /// на ChatMute (отдельный канальный механизм, PHASE 11) — глобального
  /// mute-гейта в этой фазе нет, т.к. требованиями не описан.
  async mute(targetId: string, issuedBy: string, dto: MuteUserDto) {
    await this.requireUser(targetId);
    const expiresAt = dto.durationMinutes
      ? new Date(Date.now() + dto.durationMinutes * 60_000)
      : undefined;
    return this.prisma.userPunishment.create({
      data: {
        userId: targetId,
        punishmentType: PunishmentType.MUTE,
        reason: dto.reason,
        duration: dto.durationMinutes ? `${dto.durationMinutes}m` : undefined,
        issuedBy,
        expiresAt,
      },
    });
  }

  async warn(targetId: string, issuedBy: string, dto: WarnUserDto) {
    await this.requireUser(targetId);
    return this.prisma.userPunishment.create({
      data: {
        userId: targetId,
        punishmentType: PunishmentType.WARN,
        reason: dto.reason,
        issuedBy,
      },
    });
  }

  /// KICK — немедленный разрыв текущих сессий (повторный вход не
  /// блокируется, в отличие от ban).
  async kick(targetId: string, issuedBy: string, dto: KickUserDto) {
    await this.requireUser(targetId);
    const punishment = await this.prisma.userPunishment.create({
      data: {
        userId: targetId,
        punishmentType: PunishmentType.KICK,
        reason: dto.reason ?? 'Без указания причины',
        issuedBy,
      },
    });
    await this.auth.revokeAllSessions(targetId);
    return punishment;
  }

  /// BAN — User.isBanned проверяется на каждый запрос (JwtStrategy) и при
  /// login (ADR см. PHASE 05) — эффект мгновенный. durationHours отсутствует
  /// => PERMBAN, иначе TEMPBAN с bannedUntil/expiresAt.
  async ban(targetId: string, issuedBy: string, dto: BanUserDto) {
    const target = await this.requireUser(targetId);
    if (target.isBanned) {
      throw new ForbiddenException('Пользователь уже забанен');
    }
    const bannedUntil = dto.durationHours
      ? new Date(Date.now() + dto.durationHours * 3_600_000)
      : undefined;
    const [punishment] = await this.prisma.$transaction([
      this.prisma.userPunishment.create({
        data: {
          userId: targetId,
          punishmentType: dto.durationHours
            ? PunishmentType.TEMPBAN
            : PunishmentType.PERMBAN,
          reason: dto.reason,
          duration: dto.durationHours ? `${dto.durationHours}h` : 'permanent',
          issuedBy,
          expiresAt: bannedUntil,
        },
      }),
      this.prisma.user.update({
        where: { id: targetId },
        data: { isBanned: true, banReason: dto.reason, bannedUntil },
      }),
    ]);
    await this.auth.revokeAllSessions(targetId);
    return punishment;
  }

  async hardDeleteMessage(messageId: string): Promise<{ success: true }> {
    await this.chat.hardDeleteMessage(messageId);
    return { success: true };
  }

  async hardDeleteComment(commentId: string): Promise<{ success: true }> {
    await this.comments.hardDelete(commentId);
    return { success: true };
  }

  /// Жёсткое удаление аккаунта (OWNER). FK-конфликт (есть связанные записи,
  /// которые схема не каскадирует) переводится в понятную ошибку вместо
  /// сырого Prisma-исключения.
  async deleteAccount(userId: string): Promise<{ success: true }> {
    await this.requireUser(userId);
    await this.auth.revokeAllSessions(userId);
    try {
      await this.prisma.user.delete({ where: { id: userId } });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2003') {
        throw new ForbiddenException(
          'Нельзя удалить аккаунт: есть связанные данные, которые не удаляются каскадно',
        );
      }
      throw error;
    }
    return { success: true };
  }
}
