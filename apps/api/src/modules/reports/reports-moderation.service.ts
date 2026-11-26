import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationType,
  Prisma,
  Report,
  ReportStatus,
} from '@prisma/client';
import { escapeToHtml } from '../../common/html.util';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../roles/permission.service';
import { PUBLIC_USER_SELECT } from '../users/public-user';
import { AddReportMessageDto } from './dto/add-report-message.dto';
import { AssignableStaffQueryDto } from './dto/assignable-staff-query.dto';
import { AssignReportDto } from './dto/assign-report.dto';
import { ChangeReportStatusDto } from './dto/change-report-status.dto';
import { CreateModeratorNoteDto } from './dto/create-moderator-note.dto';
import { LockReportDto } from './dto/lock-report.dto';
import { ReportHistoryQueryDto } from './dto/report-history-query.dto';
import { SetVerdictDto } from './dto/set-verdict.dto';
import { SoftDeleteMessageDto } from './dto/soft-delete-message.dto';
import { StaffListReportsQueryDto } from './dto/staff-list-reports-query.dto';
import { UpdateModeratorNoteDto } from './dto/update-moderator-note.dto';
import {
  MODERATOR_NOTES_ORDER,
  REPORT_STATUS_LABEL_RU,
} from './report-constants';
import {
  REPORT_PRIORITY_PROVIDER,
  ReportPriorityProvider,
} from './report-priority.provider';
import {
  APPEALED_MC_PUNISHMENT_SELECT,
  withMirrorView,
} from './report-mirror-appeal';
import { buildStaffReportWhere } from './report-staff-filters';

/// Для history: audit-события staff-мутаций пишет AuditInterceptor с
/// targetType = префикс permission (`reports`) и targetId = id обращения
/// (из результата хендлера); `report` — для явных вызовов AuditService.log.
const REPORT_AUDIT_TARGET_TYPES = ['reports', 'report'];

/// Право, дающее править чужие заметки (Q27, ADR-0172; автор всегда правит
/// свои).
const FOREIGN_NOTE_EDIT_PERMISSION = 'reports.notes.edit';
const FOREIGN_NOTE_UNPIN_PERMISSION = 'reports.notes.unpin';

@Injectable()
export class ReportsModerationService {
  private readonly logger = new Logger(ReportsModerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
    private readonly notifications: NotificationsService,
    @Inject(REPORT_PRIORITY_PROVIDER)
    private readonly priority: ReportPriorityProvider,
  ) {}

  /// Уведомление автору — побочный эффект: его сбой не должен ломать
  /// действие персонала. Себе (автор == исполнитель действия) не шлём.
  /// Приватность (Q51, ADR-0175): отправитель — система. fromUserId и любые
  /// данные сотрудника в уведомление автору не передаются (ни в payload, ни
  /// в push/WS/email: текст — только статус/номер); actorId нужен лишь для
  /// проверки «себе».
  private async notifyAuthor(
    report: Pick<Report, 'authorId' | 'reportNumber'>,
    actorId: string,
    type: NotificationType,
    title: string,
    message?: string,
  ): Promise<void> {
    if (report.authorId === actorId) {
      return;
    }
    try {
      await this.notifications.create({
        userId: report.authorId,
        type,
        title,
        message,
        link: `/support/${report.reportNumber}`,
        metadata: { reportNumber: report.reportNumber },
      });
    } catch (error) {
      this.logger.warn(
        `Не удалось отправить уведомление по ${report.reportNumber}: ${(error as Error).message}`,
      );
    }
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

  async listModeration(query: StaffListReportsQueryDto, actorId: string) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 30;
    const where = {
      isArchived: false,
      ...buildStaffReportWhere(query, actorId, this.priority),
    };
    const [rows, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        // Персоналу — только публичные поля пользователей (ADR-0128, ADR-0107).
        include: {
          author: { select: PUBLIC_USER_SELECT },
          assignedTo: { select: PUBLIC_USER_SELECT },
          targets: true,
          // Связь обжалования с наказанием сервера (l1-02); без BigInt в JSON.
          appealedMinecraftPunishment: {
            select: APPEALED_MC_PUNISHMENT_SELECT,
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.report.count({ where }),
    ]);
    const nowMs = Date.now();
    const items = await Promise.all(
      rows.map(async (row) => ({
        ...withMirrorView(row, nowMs, true),
        priority: await this.priority.resolve(row),
      })),
    );
    return { items, total, page, limit };
  }

  /// Кандидаты для назначения: не заблокированные пользователи (кроме
  /// системных аккаунтов) с эффективным `reports.view` — суперпользователь
  /// или роль с ALLOW-правом (то же правило, что PermissionService). Выборка
  /// одним запросом по ролям, без поштучных hasPermission. Только публичные
  /// поля (ADR-0107).
  async assignableStaff(query: AssignableStaffQueryDto) {
    const q = query.q?.trim();
    const items = await this.prisma.user.findMany({
      where: {
        isBanned: false,
        accountType: { not: 'SYSTEM' },
        ...(q ? { username: { contains: q, mode: 'insensitive' } } : {}),
        roles: {
          some: {
            role: {
              OR: [
                { isSuperuser: true },
                {
                  permissions: {
                    some: {
                      effect: 'ALLOW',
                      permission: { key: 'reports.view' },
                    },
                  },
                },
              ],
            },
          },
        },
      },
      select: PUBLIC_USER_SELECT,
      orderBy: { username: 'asc' },
      take: query.limit ?? 20,
    });
    return { items };
  }

  /// Назначение/передача: исполнитель должен существовать, не быть
  /// заблокированным и иметь `reports.view`. `assignedToId: null` — снять.
  async assign(reportNumber: string, dto: AssignReportDto, actorId: string) {
    const report = await this.requireReport(reportNumber);
    const assigneeId = dto.assignedToId ?? null;
    if (assigneeId) {
      const assignee = await this.prisma.user.findUnique({
        where: { id: assigneeId },
        select: { id: true, isBanned: true },
      });
      if (!assignee) {
        throw new NotFoundException('Исполнитель не найден');
      }
      if (assignee.isBanned) {
        throw new BadRequestException('Исполнитель заблокирован');
      }
      if (!(await this.permissions.hasPermission(assigneeId, 'reports.view'))) {
        throw new BadRequestException('У исполнителя нет доступа к обращениям');
      }
    }
    const updated = await this.prisma.report.update({
      where: { id: report.id },
      data: { assignedToId: assigneeId },
    });
    if (assigneeId && assigneeId !== actorId) {
      try {
        await this.notifications.create({
          userId: assigneeId,
          type: NotificationType.REPORT_ASSIGNED,
          title: `Вам назначено обращение ${report.reportNumber}`,
          link: `/admin/reports/${report.reportNumber}`,
          fromUserId: actorId,
          metadata: { reportNumber: report.reportNumber },
        });
      } catch (error) {
        this.logger.warn(
          `Не удалось уведомить исполнителя по ${report.reportNumber}: ${(error as Error).message}`,
        );
      }
    }
    return updated;
  }

  /// Переоткрытие закрытого обжалования при уже открытом другом по тому же
  /// наказанию нарушает частичный уникальный индекс `reports_open_mc_appeal_uniq`
  /// (ADR-0196): P2002 -> 409 `appeal_already_open`.
  private async updateReportGuarded(args: Prisma.ReportUpdateArgs) {
    try {
      return await this.prisma.report.update(args);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'appeal_already_open',
          message:
            'По этому наказанию уже есть другое открытое обращение; переоткрыть это нельзя',
        });
      }
      throw error;
    }
  }

  async changeStatus(
    reportNumber: string,
    dto: ChangeReportStatusDto,
    actorId: string,
  ) {
    const report = await this.requireReport(reportNumber);
    const updated = await this.updateReportGuarded({
      where: { id: report.id },
      data: {
        status: dto.status,
        resolvedAt: ['RESOLVED', 'REJECTED', 'CLOSED'].includes(dto.status)
          ? new Date()
          : null,
      },
    });
    if (report.status !== dto.status) {
      await this.notifyAuthor(
        report,
        actorId,
        NotificationType.REPORT_STATUS_CHANGED,
        `Статус обращения ${report.reportNumber} изменён`,
        REPORT_STATUS_LABEL_RU[dto.status as ReportStatus],
      );
    }
    return updated;
  }

  async setVerdict(reportNumber: string, dto: SetVerdictDto, actorId: string) {
    const report = await this.requireReport(reportNumber);
    const updated = await this.updateReportGuarded({
      where: { id: report.id },
      data: {
        verdict: dto.verdict,
        verdictHtml: escapeToHtml(dto.verdict),
        ...(dto.status
          ? {
              status: dto.status,
              resolvedAt: ['RESOLVED', 'REJECTED', 'CLOSED'].includes(
                dto.status,
              )
                ? new Date()
                : null,
            }
          : {}),
      },
    });
    await this.notifyAuthor(
      report,
      actorId,
      NotificationType.REPORT_VERDICT,
      `По обращению ${report.reportNumber} вынесен вердикт`,
      dto.status
        ? REPORT_STATUS_LABEL_RU[dto.status as ReportStatus]
        : undefined,
    );
    return updated;
  }

  async addMessage(
    reportNumber: string,
    staffId: string,
    dto: AddReportMessageDto,
  ) {
    const report = await this.requireReport(reportNumber);
    if (report.isLocked) {
      throw new ForbiddenException(
        'Обращение заблокировано для новых сообщений',
      );
    }
    await this.prisma.reportMessage.create({
      data: {
        reportId: report.id,
        authorId: staffId,
        content: dto.content,
        contentHtml: escapeToHtml(dto.content),
        isStaff: true,
      },
    });
    await this.notifyAuthor(
      report,
      staffId,
      NotificationType.SYSTEM,
      `Новый ответ по обращению ${report.reportNumber}`,
    );
    return this.prisma.report.findUnique({
      where: { id: report.id },
      include: {
        messages: {
          include: { attachments: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  private async requireMessage(reportId: string, messageId: string) {
    const message = await this.prisma.reportMessage.findUnique({
      where: { id: messageId },
    });
    if (!message || message.reportId !== reportId) {
      throw new NotFoundException('Сообщение не найдено');
    }
    return message;
  }

  async softDeleteMessage(
    reportNumber: string,
    messageId: string,
    moderatorId: string,
    dto: SoftDeleteMessageDto,
  ) {
    const report = await this.requireReport(reportNumber);
    await this.requireMessage(report.id, messageId);
    await this.prisma.reportMessage.update({
      where: { id: messageId },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: moderatorId,
        deleteReason: dto.reason,
      },
    });
    return this.prisma.report.findUnique({
      where: { id: report.id },
      include: {
        messages: {
          include: { attachments: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async pinMessage(
    reportNumber: string,
    messageId: string,
    moderatorId: string,
    pinned: boolean,
  ) {
    const report = await this.requireReport(reportNumber);
    await this.requireMessage(report.id, messageId);
    await this.prisma.reportMessage.update({
      where: { id: messageId },
      data: pinned
        ? { isPinned: true, pinnedAt: new Date(), pinnedBy: moderatorId }
        : { isPinned: false, pinnedAt: null, pinnedBy: null },
    });
    return this.prisma.report.findUnique({
      where: { id: report.id },
      include: {
        messages: {
          include: { attachments: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async createModeratorNote(
    reportNumber: string,
    authorId: string,
    dto: CreateModeratorNoteDto,
  ) {
    const report = await this.requireReport(reportNumber);
    await this.prisma.reportModeratorNote.create({
      data: {
        reportId: report.id,
        authorId,
        content: dto.content,
        contentHtml: escapeToHtml(dto.content),
      },
    });
    return this.prisma.report.findUnique({
      where: { id: report.id },
      include: { moderatorNotes: { orderBy: MODERATOR_NOTES_ORDER } },
    });
  }

  private async requireNote(reportId: string, noteId: string) {
    const note = await this.prisma.reportModeratorNote.findUnique({
      where: { id: noteId },
    });
    if (!note || note.reportId !== reportId) {
      throw new NotFoundException('Заметка не найдена');
    }
    return note;
  }

  async updateModeratorNote(
    reportNumber: string,
    noteId: string,
    dto: UpdateModeratorNoteDto,
    actorId: string,
  ) {
    const report = await this.requireReport(reportNumber);
    const note = await this.requireNote(report.id, noteId);
    // Править может автор заметки или актёр с reports.notes.edit.
    if (
      note.authorId !== actorId &&
      !(await this.permissions.hasPermission(
        actorId,
        FOREIGN_NOTE_EDIT_PERMISSION,
      ))
    ) {
      throw new ForbiddenException('Править можно только свои заметки');
    }
    await this.prisma.reportModeratorNote.update({
      where: { id: noteId },
      data: { content: dto.content, contentHtml: escapeToHtml(dto.content) },
    });
    return this.prisma.report.findUnique({
      where: { id: report.id },
      include: { moderatorNotes: { orderBy: MODERATOR_NOTES_ORDER } },
    });
  }

  /// Своя заметка удаляется автором. Чужая — только с reports.notes.edit;
  /// чужая закреплённая — только с reports.notes.edit И reports.notes.unpin
  /// (решение владельца Q52, ADR-0176).
  async deleteModeratorNote(
    reportNumber: string,
    noteId: string,
    actorId: string,
  ) {
    const report = await this.requireReport(reportNumber);
    const note = await this.requireNote(report.id, noteId);
    if (note.authorId !== actorId) {
      if (
        !(await this.permissions.hasPermission(
          actorId,
          FOREIGN_NOTE_EDIT_PERMISSION,
        ))
      ) {
        throw new ForbiddenException('Удалять можно только свои заметки');
      }
      if (
        note.isPinned &&
        !(await this.permissions.hasPermission(
          actorId,
          FOREIGN_NOTE_UNPIN_PERMISSION,
        ))
      ) {
        throw new ForbiddenException(
          'Удалить чужую закреплённую заметку можно только с правом открепления',
        );
      }
    }
    await this.prisma.reportModeratorNote.delete({ where: { id: noteId } });
    return this.prisma.report.findUnique({
      where: { id: report.id },
      include: { moderatorNotes: { orderBy: MODERATOR_NOTES_ORDER } },
    });
  }

  async pinModeratorNote(
    reportNumber: string,
    noteId: string,
    pinned: boolean,
  ) {
    const report = await this.requireReport(reportNumber);
    await this.requireNote(report.id, noteId);
    await this.prisma.reportModeratorNote.update({
      where: { id: noteId },
      data: { isPinned: pinned },
    });
    return this.prisma.report.findUnique({
      where: { id: report.id },
      include: { moderatorNotes: { orderBy: MODERATOR_NOTES_ORDER } },
    });
  }

  async lock(reportNumber: string, moderatorId: string, dto: LockReportDto) {
    const report = await this.requireReport(reportNumber);
    const locked = dto.locked ?? true;
    return this.prisma.report.update({
      where: { id: report.id },
      data: locked
        ? { isLocked: true, lockedBy: moderatorId, lockedReason: dto.reason }
        : { isLocked: false, lockedBy: null, lockedReason: null },
    });
  }

  /// История действий персонала по обращению (AuditLog). Без IP/User-Agent;
  /// исполнитель — только публичные поля. Срок хранения — ретенция audit.
  async history(reportNumber: string, query: ReportHistoryQueryDto) {
    const report = await this.requireReport(reportNumber);
    const page = query.page ?? 1;
    const limit = query.limit ?? 30;
    const where = {
      targetId: report.id,
      targetType: { in: REPORT_AUDIT_TARGET_TYPES },
    };
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        select: {
          id: true,
          action: true,
          targetType: true,
          targetId: true,
          changes: true,
          severity: true,
          createdAt: true,
          actor: { select: PUBLIC_USER_SELECT },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total, page, limit };
  }
}
