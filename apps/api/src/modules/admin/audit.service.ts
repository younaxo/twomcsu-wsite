import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AuditLogSeverity,
  ListAuditLogQueryDto,
} from './dto/list-audit-log-query.dto';

const RETENTION_DAYS = 90;

export interface AuditLogInput {
  actorId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  changes?: Prisma.InputJsonValue;
  ipAddress?: string;
  userAgent?: string;
  severity?: AuditLogSeverity;
  duration?: number;
}

/// Единая точка записи audit-событий (см. docs/technical/25-AUDIT-LOG.md).
/// Полное ретроактивное покрытие всех staff-мутаций всех доменов — PHASE 22;
/// здесь регистрируются только действия, появляющиеся в этой фазе
/// (settings/broadcast/bulk-users/security), см. docs/implementation/ADR
/// по PHASE 20.
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /// Ошибка записи для severity info/warning проглатывается (аудит не
  /// гарантирован) — но падает для critical, чтобы критичное действие не
  /// могло остаться без следа молча (рекомендация 25-AUDIT-LOG.md).
  async log(input: AuditLogInput): Promise<void> {
    const severity = input.severity ?? 'info';
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: input.actorId,
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId,
          changes: input.changes,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          severity,
          duration: input.duration,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Не удалось записать audit log (action=${input.action}): ${(error as Error).message}`,
      );
      if (severity === 'critical') {
        throw error;
      }
    }
  }

  async list(query: ListAuditLogQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 30;
    const where: Prisma.AuditLogWhereInput = {
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.action ? { action: { contains: query.action } } : {}),
      ...(query.severity ? { severity: query.severity } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
      ...(query.q
        ? {
            OR: [
              { action: { contains: query.q, mode: 'insensitive' } },
              { targetId: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: { actor: { select: { id: true, username: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async getStats() {
    const since24h = new Date(Date.now() - 24 * 3_600_000);
    const [total, last24h, bySeverity, topActionsRaw] = await Promise.all([
      this.prisma.auditLog.count(),
      this.prisma.auditLog.count({ where: { createdAt: { gte: since24h } } }),
      this.prisma.auditLog.groupBy({
        by: ['severity'],
        _count: { _all: true },
      }),
      this.prisma.auditLog.groupBy({
        by: ['action'],
        _count: { _all: true },
        orderBy: { _count: { action: 'desc' } },
        take: 10,
      }),
    ]);
    return {
      total,
      last24h,
      bySeverity: Object.fromEntries(
        bySeverity.map((s) => [s.severity, s._count._all]),
      ),
      topActions: topActionsRaw.map((a) => ({
        action: a.action,
        count: a._count._all,
      })),
    };
  }

  /// Удаляет записи старше RETENTION_DAYS. Периодический вызов (04:00) —
  /// PHASE 29 (нет cron-инфраструктуры); метод реализован и протестирован
  /// уже сейчас, вызывается вручную/из теста до появления планировщика.
  async cleanupOld(): Promise<{ deleted: number }> {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 3_600_000);
    const result = await this.prisma.auditLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    return { deleted: result.count };
  }
}
