import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AuditLogSeverity,
  ListAuditLogQueryDto,
} from '../admin/dto/list-audit-log-query.dto';

/// Час ежедневной очистки (локальное время сервера).
const CLEANUP_HOUR = 4;

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
/// Автоматическое покрытие всех staff-мутаций — AuditInterceptor
/// (PHASE 22, ADR-0056); явные вызовы `log()` — для обогащённых событий.
/// Ретенция — AUDIT_RETENTION_DAYS (ENV), очистка ежедневно в 04:00 без
/// внешнего планировщика (таймер процесса; в test-окружении отключён).
@Injectable()
export class AuditService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuditService.name);
  private readonly retentionDays: number;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.retentionDays = this.config.get<number>('AUDIT_RETENTION_DAYS') ?? 90;
  }

  onModuleInit(): void {
    if (this.config.get<string>('NODE_ENV') === 'test') {
      return;
    }
    this.scheduleCleanup();
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /// Следующий запуск — ближайшие 04:00; после выполнения планируется заново.
  private scheduleCleanup(): void {
    const now = new Date();
    const next = new Date(now);
    next.setHours(CLEANUP_HOUR, 0, 0, 0);
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }
    this.cleanupTimer = setTimeout(() => {
      this.cleanupOld()
        .then(({ deleted }) =>
          this.logger.log(`Очистка audit log: удалено ${deleted}`),
        )
        .catch((error: Error) =>
          this.logger.warn(`Очистка audit log не удалась: ${error.message}`),
        )
        .finally(() => this.scheduleCleanup());
    }, next.getTime() - now.getTime());
    this.cleanupTimer.unref();
  }

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

  /// Удаляет записи старше AUDIT_RETENTION_DAYS (по умолчанию 90).
  async cleanupOld(
    retentionDays: number = this.retentionDays,
  ): Promise<{ deleted: number }> {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 3_600_000);
    const result = await this.prisma.auditLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    return { deleted: result.count };
  }
}
