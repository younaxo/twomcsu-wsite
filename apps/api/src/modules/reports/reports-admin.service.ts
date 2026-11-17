import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ReportType } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  PermissionService,
  SanctionRevokeDecision,
  sanctionRevokeAuditChanges,
} from '../roles/permission.service';
import { PUBLIC_USER_SELECT } from '../users/public-user';
import { ArchiveReportDto } from './dto/archive-report.dto';
import { BanReportsDto } from './dto/ban-reports.dto';
import { ListReportsQueryDto } from './dto/list-reports-query.dto';
import { StaffListReportsQueryDto } from './dto/staff-list-reports-query.dto';
import {
  REPORT_PRIORITY_PROVIDER,
  ReportPriorityProvider,
} from './report-priority.provider';
import { buildStaffReportWhere } from './report-staff-filters';

@Injectable()
export class ReportsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REPORT_PRIORITY_PROVIDER)
    private readonly priority: ReportPriorityProvider,
    private readonly permissions: PermissionService,
    private readonly audit: AuditService,
  ) {}

  async stats() {
    const [total, byStatus, byType] = await Promise.all([
      this.prisma.report.count(),
      this.prisma.report.groupBy({ by: ['status'], _count: true }),
      this.prisma.report.groupBy({ by: ['type'], _count: true }),
    ]);
    return {
      total,
      byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
      byType: Object.fromEntries(byType.map((t) => [t.type, t._count])),
    };
  }

  async listArchived(query: StaffListReportsQueryDto, actorId: string) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 30;
    const where: Prisma.ReportWhereInput = {
      isArchived: true,
      ...buildStaffReportWhere(query, actorId, this.priority),
    };
    const [rows, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        include: { author: { select: PUBLIC_USER_SELECT }, targets: true },
        orderBy: { archivedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.report.count({ where }),
    ]);
    const items = await Promise.all(
      rows.map(async (row) => ({
        ...row,
        priority: await this.priority.resolve(row),
      })),
    );
    return { items, total, page, limit };
  }

  private async requireReport(reportNumber: string) {
    const report = await this.prisma.report.findUnique({
      where: { reportNumber },
    });
    if (!report) {
      throw new NotFoundException('Обращение не найдено');
    }
    return report;
  }

  async archiveReport(
    reportNumber: string,
    adminId: string,
    dto: ArchiveReportDto,
  ) {
    const report = await this.requireReport(reportNumber);
    return this.prisma.report.update({
      where: { id: report.id },
      data: {
        isArchived: true,
        archivedAt: new Date(),
        archivedBy: adminId,
        archiveReason: dto.reason,
      },
    });
  }

  async unarchiveReport(reportNumber: string) {
    const report = await this.requireReport(reportNumber);
    return this.prisma.report.update({
      where: { id: report.id },
      data: {
        isArchived: false,
        archivedAt: null,
        archivedBy: null,
        archiveReason: null,
      },
    });
  }

  async deleteReport(reportNumber: string): Promise<void> {
    const report = await this.requireReport(reportNumber);
    await this.prisma.report.delete({ where: { id: report.id } });
  }

  async hardDeleteMessage(
    reportNumber: string,
    messageId: string,
  ): Promise<void> {
    const report = await this.requireReport(reportNumber);
    const message = await this.prisma.reportMessage.findUnique({
      where: { id: messageId },
    });
    if (!message || message.reportId !== report.id) {
      throw new NotFoundException('Сообщение не найдено');
    }
    await this.prisma.reportMessage.delete({ where: { id: messageId } });
  }

  /// Выдача бана в обращениях (Q48; ADR-0173). 1) иерархия к цели (canActOn):
  /// банить старшего или равного нельзя; 2) новый бан ЗАМЕНЯЕТ действующие, а
  /// замена = снятие: правило снятия проверяется для каждого заменяемого бана
  /// («всё или ничего», 403 `sanction_revoke_forbidden`), иначе младший мог бы
  /// перебить бан старшего; 3) деактивация, создание и аудит снятий — в одной
  /// транзакции с условием по id проверенных банов (409 при гонке).
  async banUser(userId: string, bannedBy: string, dto: BanReportsDto) {
    if (!(await this.permissions.canActOn(bannedBy, userId))) {
      throw new ForbiddenException(
        'Недостаточно прав для действия над этим пользователем',
      );
    }
    const active = await this.prisma.reportBan.findMany({
      where: { userId, isActive: true },
    });
    const decisions: SanctionRevokeDecision[] = [];
    for (const ban of active) {
      decisions.push(
        await this.permissions.assertCanRevokeSanction(
          bannedBy,
          ban.bannedBy,
          userId,
        ),
      );
    }
    return this.prisma.$transaction(async (tx) => {
      if (active.length > 0) {
        const replaced = await tx.reportBan.updateMany({
          where: { id: { in: active.map((ban) => ban.id) }, isActive: true },
          data: { isActive: false },
        });
        if (replaced.count !== active.length) {
          throw new ConflictException(
            'Состояние банов изменилось, повторите действие',
          );
        }
        for (const [index, ban] of active.entries()) {
          await this.audit.logInTx(tx, {
            actorId: bannedBy,
            action: 'reports.ban.revoke',
            targetType: 'ReportBan',
            targetId: ban.id,
            changes: sanctionRevokeAuditChanges(
              decisions[index],
              ban.bannedBy,
              {
                userId,
                replacedByNewBan: true,
              },
            ),
            severity: 'warning',
          });
        }
      }
      return tx.reportBan.create({
        data: {
          userId,
          reason: dto.reason,
          bannedBy,
          bannedUntil: dto.bannedUntil ? new Date(dto.bannedUntil) : undefined,
        },
      });
    });
  }

  /// Снятие бана в обращениях (Q48, Q49; ADR-0173). Правило проверяется для
  /// КАЖДОГО активного бана пользователя (у разных банов разные выдавшие).
  /// Семантика «всё или ничего»: если хоть один бан снимать нельзя — 403
  /// `sanction_revoke_forbidden` и ни один бан не снимается; иначе частичное
  /// снятие оставляло бы пользователя в неопределённом состоянии, а младший
  /// мог бы «выбрать» чужие баны. На каждый снятый бан — запись в аудит.
  async unbanUser(userId: string, actorId: string): Promise<void> {
    const active = await this.prisma.reportBan.findMany({
      where: { userId, isActive: true },
    });
    const decisions: SanctionRevokeDecision[] = [];
    for (const ban of active) {
      decisions.push(
        await this.permissions.assertCanRevokeSanction(
          actorId,
          ban.bannedBy,
          userId,
        ),
      );
    }
    if (active.length === 0) {
      return;
    }
    // L-2/L-3: деактивация условна по id проверенных банов, аудит — в той же
    // транзакции (ошибка аудита откатывает снятие, ничего не теряется тихо).
    await this.prisma.$transaction(async (tx) => {
      const released = await tx.reportBan.updateMany({
        where: { id: { in: active.map((ban) => ban.id) }, isActive: true },
        data: { isActive: false },
      });
      if (released.count !== active.length) {
        throw new ConflictException(
          'Состояние банов изменилось, повторите действие',
        );
      }
      for (const [index, ban] of active.entries()) {
        await this.audit.logInTx(tx, {
          actorId,
          action: 'reports.ban.revoke',
          targetType: 'ReportBan',
          targetId: ban.id,
          changes: sanctionRevokeAuditChanges(decisions[index], ban.bannedBy, {
            userId,
          }),
          severity: 'warning',
        });
      }
    });
  }

  async listDonations(query: ListReportsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 30;
    const where: Prisma.ReportWhereInput = {
      type: ReportType.DONATION_PROBLEM,
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        include: { author: { select: PUBLIC_USER_SELECT } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.report.count({ where }),
    ]);
    return { items, total, page, limit };
  }
}
