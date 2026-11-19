import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  actor: string | null;
  action: string;
  objectType?: string;
  objectId?: string;
  mode?: 'live' | 'test';
  /// Короткая подробность без секретов, токенов и IP.
  detail?: string;
}

/// Аудит админки (ADR-G003 п. 7). Запись изменений обязательна: ошибка
/// записи пробрасывается и отменяет ответ (fail closed). Для отказов входа
/// используется `recordSafe`.
@Injectable()
export class GiveawayAdminAuditService {
  private readonly logger = new Logger(GiveawayAdminAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.prisma.giveawayAdminAudit.create({
      data: {
        actor: entry.actor,
        action: entry.action.slice(0, 48),
        objectType: entry.objectType?.slice(0, 24) ?? null,
        objectId: entry.objectId?.slice(0, 64) ?? null,
        mode: entry.mode ?? null,
        detail: entry.detail?.slice(0, 500) ?? null,
      },
    });
  }

  async recordSafe(entry: AuditEntry): Promise<void> {
    try {
      await this.record(entry);
    } catch {
      this.logger.error('giveaway audit write failed');
    }
  }

  async list(page: number, pageSize: number) {
    const [total, rows] = await Promise.all([
      this.prisma.giveawayAdminAudit.count(),
      this.prisma.giveawayAdminAudit.findMany({
        orderBy: { at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        at: r.at.toISOString(),
        actor: r.actor,
        action: r.action,
        objectType: r.objectType,
        objectId: r.objectId,
        mode: r.mode,
        detail: r.detail,
      })),
      page,
      pageSize,
      total,
    };
  }
}
