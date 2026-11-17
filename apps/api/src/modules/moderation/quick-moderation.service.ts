import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PunishmentType } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import {
  PermissionService,
  sanctionRevokeAuditChanges,
} from '../roles/permission.service';
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
    private readonly permissions: PermissionService,
    private readonly audit: AuditService,
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
    // Иерархия к цели (Q48): выдать бан старшему или равному по приоритету
    // нельзя (массовый бан проверяет то же самое до вызова).
    if (!(await this.permissions.canActOn(issuedBy, targetId))) {
      throw new ForbiddenException(
        'Недостаточно прав для действия над этим пользователем',
      );
    }
    if (target.isBanned) {
      throw new ForbiddenException('Пользователь уже забанен');
    }
    const bannedUntil = dto.durationHours
      ? new Date(Date.now() + dto.durationHours * 3_600_000)
      : undefined;
    const punishment = await this.prisma.$transaction(async (tx) => {
      // Условный перевод isBanned false -> true: две одновременные выдачи
      // не перезапишут bannedById друг друга (L-1).
      const claimed = await tx.user.updateMany({
        where: { id: targetId, isBanned: false },
        data: {
          isBanned: true,
          banReason: dto.reason,
          bannedUntil: bannedUntil ?? null,
          bannedById: issuedBy,
        },
      });
      if (claimed.count === 0) {
        throw new ConflictException(
          'Состояние пользователя изменилось, повторите действие',
        );
      }
      return tx.userPunishment.create({
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
      });
    });
    await this.auth.revokeAllSessions(targetId);
    return punishment;
  }

  /// UNBAN — снимает account-level бан (отдельно от ReportBan, см.
  /// ReportsAdminService.unbanUser). Сессии не восстанавливаются — после
  /// разбана пользователь просто снова может пройти login.
  /// Единое правило снятия санкции (Q48, Q49; ADR-0173): владелец всегда;
  /// бан без записи «кто выдал» (старый, выдавший удалён или SYSTEM) — только
  /// владелец; с себя чужой бан не-владелец снять не может; иначе выдавший
  /// либо равный/старший по приоритету. Каждое снятие пишется в аудит.
  async unban(targetId: string, actorId: string): Promise<{ success: true }> {
    const target = await this.requireUser(targetId);
    if (!target.isBanned) {
      throw new ForbiddenException('Пользователь не забанен');
    }
    const decision = await this.permissions.assertCanRevokeSanction(
      actorId,
      target.bannedById,
      targetId,
    );
    // L-1/L-3: снятие условно по состоянию, на котором принято решение
    // (isBanned и bannedById), а аудит пишется в той же транзакции: если
    // бан перевыдан другим за время проверки — 409 (повторять решение
    // автоматически нельзя: проверка прав относилась к другому выдавшему),
    // если аудит не записался — снятие откатывается.
    await this.prisma.$transaction(async (tx) => {
      const released = await tx.user.updateMany({
        where: {
          id: targetId,
          isBanned: true,
          bannedById: target.bannedById ?? null,
        },
        data: {
          isBanned: false,
          banReason: null,
          bannedUntil: null,
          bannedById: null,
        },
      });
      if (released.count === 0) {
        throw new ConflictException(
          'Состояние бана изменилось, проверьте его и повторите действие',
        );
      }
      await this.audit.logInTx(tx, {
        actorId,
        action: 'user.unban',
        targetType: 'User',
        targetId,
        changes: sanctionRevokeAuditChanges(decision, target.bannedById),
        severity: 'warning',
      });
    });
    return { success: true };
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
