import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Report, ReportStatus, ReportType } from '@prisma/client';
import { randomBytes } from 'crypto';
import { escapeToHtml } from '../../common/html.util';
import { PrismaService } from '../prisma/prisma.service';
import { AddReportMessageDto } from './dto/add-report-message.dto';
import { CreateDonationProblemDto } from './dto/create-donation-problem.dto';
import { CreateReportDto } from './dto/create-report.dto';
import { ListReportsQueryDto } from './dto/list-reports-query.dto';
import { UpdateOwnReportMessageDto } from './dto/update-own-report-message.dto';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

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
        include: { targets: true },
        // Внутренняя заметка персонала — не для автора (ADR-0119).
        omit: { internalNote: true },
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
      include: {
        targets: true,
        evidenceLinks: true,
        attachments: true,
        messages: {
          where: isStaff ? undefined : { isDeleted: false },
          include: { attachments: true },
          orderBy: { createdAt: 'asc' },
        },
        ...(isStaff ? { moderatorNotes: true } : {}),
      },
    });
    if (!report) {
      throw new NotFoundException('Обращение не найдено');
    }
    if (!isStaff && report.authorId !== viewerId) {
      throw new ForbiddenException('Это обращение вам не принадлежит');
    }
    if (isStaff) {
      return report;
    }
    // Внутренняя заметка персонала — не для автора обращения (ADR-0119).
    const { internalNote: _internal, ...visible } = report;
    return visible;
  }

  async createReport(authorId: string, dto: CreateReportDto) {
    await this.requireNotBanned(authorId);
    const usernames = dto.targets.map((t) => t.username);
    const targetUsers = await this.prisma.user.findMany({
      where: { username: { in: usernames, mode: 'insensitive' } },
      select: { id: true, username: true },
    });
    const userIdByUsername = new Map(
      targetUsers.map((u) => [u.username.toLowerCase(), u.id]),
    );

    const reportNumber = await this.generateReportNumber();
    return this.prisma.report.create({
      data: {
        reportNumber,
        type: dto.type,
        authorId,
        server: dto.server,
        incidentDate: dto.incidentDate ? new Date(dto.incidentDate) : undefined,
        description: dto.description,
        descriptionHtml: escapeToHtml(dto.description),
        additionalText: dto.additionalText,
        contactEmail: dto.contactEmail,
        contactPhone: dto.contactPhone,
        targets: {
          create: dto.targets.map((t, index) => ({
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
      include: { targets: true, evidenceLinks: true },
    });
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
    if (report.isLocked) {
      throw new ForbiddenException(
        'Обращение заблокировано для новых сообщений',
      );
    }
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
    await this.prisma.reportMessage.update({
      where: { id: messageId },
      data: { content: dto.content, contentHtml: escapeToHtml(dto.content) },
    });
    return this.getByNumber(reportNumber, authorId, false);
  }

  async createDonationProblem(authorId: string, dto: CreateDonationProblemDto) {
    await this.requireNotBanned(authorId);
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
    });
  }
}
