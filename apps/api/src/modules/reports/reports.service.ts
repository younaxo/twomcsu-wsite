import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Report, ReportStatus, ReportType } from '@prisma/client';
import { randomBytes } from 'crypto';
import { escapeToHtml } from '../../common/html.util';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_USER_SELECT } from '../users/public-user';
import { AddReportMessageDto } from './dto/add-report-message.dto';
import { CreateDonationProblemDto } from './dto/create-donation-problem.dto';
import { CreateReportDto } from './dto/create-report.dto';
import { ReportHistoryQueryDto } from './dto/report-history-query.dto';
import { ListReportsQueryDto } from './dto/list-reports-query.dto';
import { UpdateOwnReportMessageDto } from './dto/update-own-report-message.dto';
import {
  CLOSED_REPORT_STATUSES,
  MODERATOR_NOTES_ORDER,
  REPORT_CREATE_LIMIT,
  REPORT_CREATE_WINDOW_MS,
  REPORT_MESSAGE_LIMIT,
  REPORT_MESSAGE_WINDOW_MS,
} from './report-constants';
import {
  REPORT_PRIORITY_PROVIDER,
  ReportPriorityProvider,
} from './report-priority.provider';

/// Обжалуемое наказание в ответе: без `issuedBy` (id сотрудника) и прочего.
const APPEALED_PUNISHMENT_SELECT = {
  id: true,
  punishmentType: true,
  reason: true,
  issuedAt: true,
  expiresAt: true,
  isActive: true,
  isAppealable: true,
} satisfies Prisma.UserPunishmentSelect;

/// Служебные поля обращения, которые игрок не получает (ADR-0119): заметка и
/// исполнитель, блокировка/архивация (кто и почему), legacy-наказание.
const PLAYER_REPORT_OMIT = {
  internalNote: true,
  assignedToId: true,
  lockedBy: true,
  isArchived: true,
  archivedAt: true,
  archivedBy: true,
  archiveReason: true,
  punishmentType: true,
  punishmentDuration: true,
  punishmentReason: true,
} satisfies Prisma.ReportOmit;

/// Сообщения: без данных о том, кто и почему удалил/закрепил.
const PLAYER_MESSAGE_OMIT = {
  deletedAt: true,
  deletedBy: true,
  deleteReason: true,
  pinnedBy: true,
  pinnedAt: true,
} satisfies Prisma.ReportMessageOmit;

/// Цели: без внутреннего id найденного пользователя.
const PLAYER_TARGET_OMIT = { userId: true } satisfies Prisma.ReportTargetOmit;

/// Вложения обращения: без id загрузившего.
const PLAYER_ATTACHMENT_OMIT = {
  uploadedBy: true,
} satisfies Prisma.ReportAttachmentOmit;

/// Вложения сообщений: без id загрузившего.
const PLAYER_MESSAGE_ATTACHMENT_OMIT = {
  uploadedBy: true,
} satisfies Prisma.ReportMessageAttachmentOmit;

/// Белый список audit-действий для истории автора -> вид события.
const PLAYER_HISTORY_KIND: Record<string, 'STATUS_CHANGED' | 'VERDICT'> = {
  'reports.status': 'STATUS_CHANGED',
  'reports.verdict': 'VERDICT',
};

export interface PlayerHistoryItem {
  id: string;
  kind: 'CREATED' | 'STATUS_CHANGED' | 'VERDICT';
  status: ReportStatus | null;
  createdAt: Date;
}

function extractStatus(changes: Prisma.JsonValue): ReportStatus | null {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
    return null;
  }
  const status = (changes as Record<string, unknown>).status;
  return typeof status === 'string' &&
    (Object.values(ReportStatus) as string[]).includes(status)
    ? (status as ReportStatus)
    : null;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REPORT_PRIORITY_PROVIDER)
    private readonly priority: ReportPriorityProvider,
  ) {}

  private assertAuthorCanWrite(report: Report): void {
    if (report.isLocked) {
      throw new ForbiddenException(
        'Обращение заблокировано для новых сообщений',
      );
    }
    if (CLOSED_REPORT_STATUSES.includes(report.status)) {
      throw new ForbiddenException(
        'Обращение закрыто: новые сообщения недоступны',
      );
    }
  }

  private async generateReportNumber(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const randomPart = randomBytes(3).toString('hex').toUpperCase();
      const reportNumber = `R-${datePart}-${randomPart}`;
      const existing = await this.prisma.report.findUnique({
        where: { reportNumber },
      });
      if (!existing) {
        return reportNumber;
      }
    }
    throw new Error('Не удалось сгенерировать уникальный номер обращения');
  }

  /// Антиспам по пользователю: обращения автора за окно (все типы). Гонка двух
  /// параллельных запросов на границе допустима: это не учёт денег.
  private async assertReportCreateRate(authorId: string): Promise<void> {
    const count = await this.prisma.report.count({
      where: {
        authorId,
        createdAt: { gte: new Date(Date.now() - REPORT_CREATE_WINDOW_MS) },
      },
    });
    if (count >= REPORT_CREATE_LIMIT) {
      throw new HttpException(
        'Слишком много обращений за короткое время. Попробуйте позже',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /// Антиспам по сообщениям игрока (не персонала) за окно. Гонка параллельных
  /// запросов на границе допустима: это не учёт денег.
  private async assertPlayerMessageRate(authorId: string): Promise<void> {
    const count = await this.prisma.reportMessage.count({
      where: {
        authorId,
        isStaff: false,
        createdAt: { gte: new Date(Date.now() - REPORT_MESSAGE_WINDOW_MS) },
      },
    });
    if (count >= REPORT_MESSAGE_LIMIT) {
      throw new HttpException(
        'Слишком много сообщений за короткое время. Попробуйте позже',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async requireNotBanned(userId: string): Promise<void> {
    const ban = await this.prisma.reportBan.findFirst({
      where: {
        userId,
        isActive: true,
        OR: [{ bannedUntil: null }, { bannedUntil: { gt: new Date() } }],
      },
    });
    if (ban) {
      throw new ForbiddenException(
        'Вам временно запрещено создавать обращения',
      );
    }
  }

  /// Страница с правилами подачи обращений — конкретная Topic (PHASE 14).
  /// Ищет по slug `report-rules-<type>`, затем по общему `report-rules`;
  /// если ни одна не создана администратором — возвращает null (не ошибка).
  async getRules(type?: ReportType) {
    if (type) {
      const specific = await this.prisma.topic.findUnique({
        where: {
          slug: `report-rules-${type.toLowerCase().replace(/_/g, '-')}`,
        },
      });
      if (specific) {
        return specific;
      }
    }
    return this.prisma.topic.findUnique({ where: { slug: 'report-rules' } });
  }

  async listMine(authorId: string, query: ListReportsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 30;
    const where = {
      authorId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        include: { targets: { omit: PLAYER_TARGET_OMIT } },
        // Служебные поля персонала — не для автора (ADR-0119).
        omit: PLAYER_REPORT_OMIT,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.report.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  private async requireReport(reportNumber: string): Promise<Report> {
    const report = await this.prisma.report.findUnique({
      where: { reportNumber },
    });
    if (!report) {
      throw new NotFoundException('Обращение не найдено');
    }
    return report;
  }

  async getByNumber(reportNumber: string, viewerId: string, isStaff: boolean) {
    const report = await this.prisma.report.findUnique({
      where: { reportNumber },
      // Игроку — без служебных полей персонала (ADR-0119).
      ...(isStaff ? {} : { omit: PLAYER_REPORT_OMIT }),
      include: {
        targets: isStaff ? true : { omit: PLAYER_TARGET_OMIT },
        evidenceLinks: true,
        attachments: isStaff ? true : { omit: PLAYER_ATTACHMENT_OMIT },
        appealedPunishment: { select: APPEALED_PUNISHMENT_SELECT },
        messages: {
          where: isStaff ? undefined : { isDeleted: false },
          include: {
            attachments: isStaff
              ? true
              : { omit: PLAYER_MESSAGE_ATTACHMENT_OMIT },
          },
          ...(isStaff ? {} : { omit: PLAYER_MESSAGE_OMIT }),
          orderBy: { createdAt: 'asc' },
        },
        // Персоналу — автор и исполнитель (публичные поля, ADR-0128) и заметки.
        ...(isStaff
          ? {
              moderatorNotes: { orderBy: MODERATOR_NOTES_ORDER },
              author: { select: PUBLIC_USER_SELECT },
              assignedTo: { select: PUBLIC_USER_SELECT },
            }
          : {}),
      },
    });
    if (!report) {
      throw new NotFoundException('Обращение не найдено');
    }
    if (!isStaff && report.authorId !== viewerId) {
      throw new ForbiddenException('Это обращение вам не принадлежит');
    }
    if (isStaff) {
      // Приоритет вычисляется на сервере и виден только персоналу.
      return {
        ...report,
        priority: await this.priority.resolve(report),
      };
    }
    // Приватность: игрок не видит id сотрудников в сообщениях персонала.
    return {
      ...report,
      messages: report.messages.map((message) =>
        message.isStaff ? { ...message, authorId: null } : message,
      ),
    };
  }

  /// История для автора: только санитизированные вехи (создано, смена
  /// статуса, вердикт) без сотрудника, IP/UA, тел запросов, заметок и
  /// внутренних полей. Из AuditLog берутся действия по белому списку; статус —
  /// из `changes.status`, если он валидный ReportStatus. Событие «создано»
  /// синтетическое (по `createdAt` обращения) и стоит самым старым — на
  /// последней странице.
  async historyForAuthor(
    reportNumber: string,
    viewerId: string,
    query: ReportHistoryQueryDto,
  ) {
    const report = await this.requireReport(reportNumber);
    if (report.authorId !== viewerId) {
      throw new ForbiddenException('Это обращение вам не принадлежит');
    }
    const page = query.page ?? 1;
    const limit = query.limit ?? 30;
    const skip = (page - 1) * limit;
    const where = {
      targetId: report.id,
      targetType: { in: ['reports', 'report'] },
      action: { in: Object.keys(PLAYER_HISTORY_KIND) },
    };
    const [rows, auditTotal] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        select: { id: true, action: true, changes: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    const items: PlayerHistoryItem[] = rows.map((row) => ({
      id: row.id,
      kind: PLAYER_HISTORY_KIND[row.action],
      status: extractStatus(row.changes),
      createdAt: row.createdAt,
    }));
    if (skip <= auditTotal && items.length < limit) {
      items.push({
        id: `created-${report.id}`,
        kind: 'CREATED',
        status: null,
        createdAt: report.createdAt,
      });
    }
    return { items, total: auditTotal + 1, page, limit };
  }

  async createReport(authorId: string, dto: CreateReportDto) {
    await this.requireNotBanned(authorId);
    await this.assertReportCreateRate(authorId);
    const targets = dto.targets ?? [];
    const complaint =
      dto.type === 'PLAYER_COMPLAINT' || dto.type === 'ADMIN_COMPLAINT';
    if (complaint && targets.length === 0) {
      throw new BadRequestException('Укажите ник нарушителя');
    }
    const isAppeal = this.assertAppealShape(dto);
    const usernames = targets.map((t) => t.username);
    const targetUsers = await this.prisma.user.findMany({
      where: { username: { in: usernames, mode: 'insensitive' } },
      select: { id: true, username: true },
    });
    const userIdByUsername = new Map(
      targetUsers.map((u) => [u.username.toLowerCase(), u.id]),
    );

    const reportNumber = await this.generateReportNumber();
    const create = (db: Prisma.TransactionClient) =>
      db.report.create({
        data: {
          reportNumber,
          type: dto.type,
          authorId,
          appealedPunishmentId: dto.appealedPunishmentId,
          server: dto.server,
          incidentDate: dto.incidentDate
            ? new Date(dto.incidentDate)
            : undefined,
          description: dto.description,
          descriptionHtml: escapeToHtml(dto.description),
          additionalText: dto.additionalText,
          contactEmail: dto.contactEmail,
          contactPhone: dto.contactPhone,
          targets: {
            create: targets.map((t, index) => ({
              username: t.username,
              userId: userIdByUsername.get(t.username.toLowerCase()),
              order: index,
            })),
          },
          evidenceLinks: dto.evidenceLinks
            ? {
                create: dto.evidenceLinks.map((e, index) => ({
                  url: e.url,
                  title: e.title,
                  type: e.type,
                  order: index,
                })),
              }
            : undefined,
        },
        omit: PLAYER_REPORT_OMIT,
        include: {
          targets: { omit: PLAYER_TARGET_OMIT },
          evidenceLinks: true,
          appealedPunishment: { select: APPEALED_PUNISHMENT_SELECT },
        },
      });

    if (!isAppeal) {
      return create(this.prisma);
    }
    // Проверка и создание обжалования — в одной транзакции под блокировкой
    // строки наказания: два параллельных запроса выполняются по очереди, и
    // второй видит открытое обращение первого (409).
    return this.prisma.$transaction(async (tx) => {
      await this.lockAndValidateAppeal(
        tx,
        authorId,
        dto.appealedPunishmentId as string,
      );
      return create(tx);
    });
  }

  /// Форма обжалования без обращения к БД: `appealedPunishmentId` обязателен
  /// для PUNISHMENT_APPEAL и запрещён для остальных типов. Возвращает,
  /// является ли обращение обжалованием.
  private assertAppealShape(dto: CreateReportDto): boolean {
    if (dto.type !== ReportType.PUNISHMENT_APPEAL) {
      if (dto.appealedPunishmentId !== undefined) {
        throw new BadRequestException(
          'Поле appealedPunishmentId допустимо только для обжалования наказания',
        );
      }
      return false;
    }
    if (!dto.appealedPunishmentId) {
      throw new BadRequestException('Укажите наказание, которое обжалуете');
    }
    return true;
  }

  /// Блокирует строку наказания (`SELECT ... FOR UPDATE`) и проверяет:
  /// наказание принадлежит автору и обжалуемо, открытого обращения по нему
  /// нет. Чужое/несуществующее наказание — одинаковый 404, чтобы не раскрывать
  /// чужие id. Вызывать только внутри транзакции.
  private async lockAndValidateAppeal(
    tx: Prisma.TransactionClient,
    authorId: string,
    punishmentId: string,
  ): Promise<void> {
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM "user_punishments" WHERE id = ${punishmentId} FOR UPDATE`,
    );
    const punishment = await tx.userPunishment.findUnique({
      where: { id: punishmentId },
    });
    if (!punishment || punishment.userId !== authorId) {
      throw new NotFoundException('Наказание не найдено');
    }
    if (!punishment.isAppealable) {
      throw new BadRequestException('Это наказание нельзя обжаловать');
    }
    const open = await tx.report.findFirst({
      where: {
        appealedPunishmentId: punishment.id,
        status: { notIn: CLOSED_REPORT_STATUSES },
      },
      select: { id: true },
    });
    if (open) {
      throw new ConflictException(
        'По этому наказанию уже есть открытое обращение',
      );
    }
  }

  async addMessage(
    reportNumber: string,
    authorId: string,
    dto: AddReportMessageDto,
  ) {
    const report = await this.requireReport(reportNumber);
    if (report.authorId !== authorId) {
      throw new ForbiddenException('Это обращение вам не принадлежит');
    }
    this.assertAuthorCanWrite(report);
    await this.assertPlayerMessageRate(authorId);
    await this.prisma.reportMessage.create({
      data: {
        reportId: report.id,
        authorId,
        content: dto.content,
        contentHtml: escapeToHtml(dto.content),
        isStaff: false,
      },
    });
    return this.getByNumber(reportNumber, authorId, false);
  }

  async updateOwnMessage(
    reportNumber: string,
    authorId: string,
    messageId: string,
    dto: UpdateOwnReportMessageDto,
  ) {
    const report = await this.requireReport(reportNumber);
    const message = await this.prisma.reportMessage.findUnique({
      where: { id: messageId },
    });
    if (!message || message.reportId !== report.id || message.isDeleted) {
      throw new NotFoundException('Сообщение не найдено');
    }
    if (message.authorId !== authorId) {
      throw new ForbiddenException('Редактировать можно только свои сообщения');
    }
    // Блокировка действует на всех; завершённый статус — только на сообщения
    // автора обращения (сотрудник правит своё сообщение, как и раньше).
    if (message.isStaff) {
      if (report.isLocked) {
        throw new ForbiddenException(
          'Обращение заблокировано для новых сообщений',
        );
      }
    } else {
      this.assertAuthorCanWrite(report);
      await this.assertPlayerMessageRate(authorId);
    }
    await this.prisma.reportMessage.update({
      where: { id: messageId },
      data: { content: dto.content, contentHtml: escapeToHtml(dto.content) },
    });
    return this.getByNumber(reportNumber, authorId, false);
  }

  async createDonationProblem(authorId: string, dto: CreateDonationProblemDto) {
    await this.requireNotBanned(authorId);
    await this.assertReportCreateRate(authorId);
    const reportNumber = await this.generateReportNumber();
    return this.prisma.report.create({
      data: {
        reportNumber,
        type: ReportType.DONATION_PROBLEM,
        status: ReportStatus.PENDING,
        authorId,
        description: dto.description,
        descriptionHtml: escapeToHtml(dto.description),
        paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : undefined,
        contactEmail: dto.contactEmail,
      },
      omit: PLAYER_REPORT_OMIT,
    });
  }
}
