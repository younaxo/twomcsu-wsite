import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../roles/permission.service';
import { StaffPunishmentResponse } from './api/punishments-api.types';
import { issuerHideForbidden, punishmentNotFound } from './punishments-errors';
import {
  PunishmentsReadService,
  isOfflineUuid,
  normalizeAccountUuid,
} from './punishments-read.service';
import { MirrorRow, parseRef } from './punishments-view';

export const ISSUER_HIDE_PERMISSION = 'punishments.issuer.hide';
const STAFF_VIEW_PERMISSION = 'users.punishments';
/// Один повтор при гонке POST/DELETE (контракт 4.2).
const MAX_ATTEMPTS = 2;

type Mode = 'hide' | 'unhide';

/// IP и User-Agent запроса для аудита: действие идёт с `@SkipAudit()`, общий
/// AuditInterceptor их не запишет, поэтому контроллер передаёт их явно.
export interface IssuerHideRequestMeta {
  ipAddress?: string;
  userAgent?: string;
}

/// Скрытие и показ выдавшего у конкретного наказания (контракт 4.2, Q63 п.3).
/// Право и 2FA проверяет `PermissionsGuard`; здесь - иерархия относительно
/// выдавшего (N3), условный UPDATE и аудит в ОДНОЙ транзакции (N2).
@Injectable()
export class PunishmentsIssuerHideService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
    private readonly audit: AuditService,
    private readonly reader: PunishmentsReadService,
  ) {}

  hide(
    actorId: string,
    ref: string,
    reason: string,
    meta: IssuerHideRequestMeta = {},
  ): Promise<StaffPunishmentResponse> {
    return this.change('hide', actorId, ref, reason, meta);
  }

  unhide(
    actorId: string,
    ref: string,
    meta: IssuerHideRequestMeta = {},
  ): Promise<StaffPunishmentResponse> {
    return this.change('unhide', actorId, ref, null, meta);
  }

  private async change(
    mode: Mode,
    actorId: string,
    ref: string,
    reason: string | null,
    meta: IssuerHideRequestMeta,
  ): Promise<StaffPunishmentResponse> {
    const parsed = parseRef(ref, false);
    if (parsed === null) throw punishmentNotFound();

    let current: MirrorRow | null = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      current = await this.reader.findByRef(parsed.kind, parsed.sourceId);
      if (!current) throw punishmentNotFound();

      await this.assertIssuerAccess(actorId, current);

      const alreadyTarget =
        mode === 'hide' ? current.issuerHidden : !current.issuerHidden;
      if (alreadyTarget) return this.reader.staffCardOf(current);

      if (mode === 'unhide') {
        await this.assertCanUnhide(actorId, current.issuerHiddenById);
      }

      const changed = await this.applyInTransaction(
        mode,
        actorId,
        ref,
        reason,
        current,
        meta,
      );
      if (changed) {
        // Кэш сбрасывается только после успешной фиксации транзакции.
        this.reader.invalidatePublicCache();
        const fresh = await this.reader.findByRef(parsed.kind, parsed.sourceId);
        if (!fresh) throw punishmentNotFound();
        return this.reader.staffCardOf(fresh);
      }
      // Ноль строк: состояние изменили между чтением и записью; повторить
      // чтение и проверку один раз.
    }
    const latest = await this.reader.findByRef(parsed.kind, parsed.sourceId);
    if (!latest) throw punishmentNotFound();
    return this.reader.staffCardOf(latest);
  }

  /// Условный UPDATE и аудит в одной транзакции. Возвращает, изменилась ли
  /// строка. Сбой аудита откатывает UPDATE и пробрасывается (500).
  private async applyInTransaction(
    mode: Mode,
    actorId: string,
    ref: string,
    reason: string | null,
    row: MirrorRow,
    meta: IssuerHideRequestMeta,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      // Low-3: иерархия перепроверяется непосредственно перед условным UPDATE
      // в той же транзакции (роль актора или скрывшего могла измениться между
      // первой проверкой и записью). Отказ - 403 и откат без записи.
      await this.assertIssuerAccess(actorId, row);
      if (mode === 'unhide') {
        await this.assertCanUnhide(actorId, row.issuerHiddenById);
      }
      const now = new Date();
      const result = await tx.minecraftPunishment.updateMany({
        where:
          mode === 'hide'
            ? { id: row.id, issuerHidden: false }
            : {
                id: row.id,
                issuerHidden: true,
                issuerHiddenById: row.issuerHiddenById,
              },
        data:
          mode === 'hide'
            ? {
                issuerHidden: true,
                issuerHiddenById: actorId,
                issuerHiddenAt: now,
                issuerHiddenReason: reason,
                rev: { increment: 1 },
                lastChangedAt: now,
              }
            : {
                issuerHidden: false,
                issuerHiddenById: null,
                issuerHiddenAt: null,
                issuerHiddenReason: null,
                rev: { increment: 1 },
                lastChangedAt: now,
              },
      });
      if (result.count !== 1) return false;
      const changes: Prisma.InputJsonObject = {
        ref,
        subjectUuid: row.subjectUuid,
        reason,
        previous: {
          issuerHidden: row.issuerHidden,
          issuerHiddenById: row.issuerHiddenById,
          issuerHiddenReason: row.issuerHiddenReason,
        },
      };
      await this.audit.logInTx(tx, {
        actorId,
        action:
          mode === 'hide'
            ? 'punishment.issuer.hide'
            : 'punishment.issuer.unhide',
        targetType: 'MinecraftPunishment',
        targetId: row.id,
        changes,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        severity: 'warning',
      });
      return true;
    });
  }

  /// Иерархия относительно выдавшего (контракт 4.2, п.3, N3). Первое
  /// подходящее правило разрешает; иначе 403 `punishments_issuer_hide_forbidden`.
  async assertIssuerAccess(actorId: string, row: MirrorRow): Promise<void> {
    // 1. superuser (canActOn не пропускает superuser над superuser).
    if (await this.permissions.isSuperuser(actorId)) return;
    // 2. Консоль.
    if (row.executorIsConsole) return;

    // Сопоставление только по подтверждённой привязке; офлайн-uuid (v3) и
    // вычисление uuid из ника не используются.
    const uuid = row.executorUuid
      ? normalizeAccountUuid(row.executorUuid)
      : null;
    const account =
      uuid !== null && !isOfflineUuid(uuid)
        ? await this.prisma.minecraftAccount.findUnique({
            where: { uuid },
            select: { userId: true, user: { select: { accountType: true } } },
          })
        : null;

    if (account) {
      // 2 (SYSTEM): не человек и не сотрудник.
      if (account.user.accountType === 'SYSTEM') return;
      // 3. Сам действующий.
      if (account.userId === actorId) return;
      // 4. Приоритет строго выше.
      if (await this.permissions.canActOn(actorId, account.userId)) return;
      throw issuerHideForbidden();
    }

    // 5. Несопоставленный: приоритет не ниже M.
    const threshold = await this.staffPriorityThreshold();
    if (threshold !== null) {
      const actorPriority = await this.permissions.getMaxPriority(actorId);
      if (actorPriority >= threshold) return;
    }
    throw issuerHideForbidden();
  }

  /// M: максимальный `Role.priority` среди НЕ superuser-ролей с правом
  /// скрытия или `users.punishments` (запрос в момент действия).
  async staffPriorityThreshold(): Promise<number | null> {
    const result = await this.prisma.role.aggregate({
      _max: { priority: true },
      where: {
        isSuperuser: false,
        permissions: {
          some: {
            effect: 'ALLOW',
            permission: {
              key: { in: [ISSUER_HIDE_PERMISSION, STAFF_VIEW_PERMISSION] },
            },
          },
        },
      },
    });
    return result._max.priority ?? null;
  }

  /// Снятие скрытия (контракт 4.2, п.4): не ниже по приоритету того, кто
  /// скрыл, либо superuser; скрывший не найден - только superuser.
  async assertCanUnhide(
    actorId: string,
    hiddenById: string | null,
  ): Promise<void> {
    if (await this.permissions.isSuperuser(actorId)) return;
    if (hiddenById === null) throw issuerHideForbidden();
    const hider = await this.prisma.user.findUnique({
      where: { id: hiddenById },
      select: { id: true },
    });
    if (!hider) throw issuerHideForbidden();
    if (hider.id === actorId) return;
    const [actorPriority, hiderPriority] = await Promise.all([
      this.permissions.getMaxPriority(actorId),
      this.permissions.getMaxPriority(hider.id),
    ]);
    if (actorPriority >= hiderPriority) return;
    throw issuerHideForbidden();
  }
}
