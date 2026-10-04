import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { escapeToHtml } from '../../common/html.util';
import { PrismaService } from '../prisma/prisma.service';
import { AddReportMessageDto } from './dto/add-report-message.dto';
import { AssignReportDto } from './dto/assign-report.dto';
import { ChangeReportStatusDto } from './dto/change-report-status.dto';
import { CreateModeratorNoteDto } from './dto/create-moderator-note.dto';
import { ListReportsQueryDto } from './dto/list-reports-query.dto';
import { LockReportDto } from './dto/lock-report.dto';
import { SetVerdictDto } from './dto/set-verdict.dto';
import { SoftDeleteMessageDto } from './dto/soft-delete-message.dto';
import { UpdateModeratorNoteDto } from './dto/update-moderator-note.dto';

@Injectable()
export class ReportsModerationService {
  constructor(private readonly prisma: PrismaService) {}

  private async requireReport(reportNumber: string) {
    const report = await this.prisma.report.findUnique({
      where: { reportNumber },
    });
    if (!report) {
      throw new NotFoundException('Обращение не найдено');
    }
    return report;
  }

  async listModeration(query: ListReportsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 30;
    const where: Prisma.ReportWhereInput = {
      isArchived: false,
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        include: { author: true, assignedTo: true, targets: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.report.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async assign(reportNumber: string, dto: AssignReportDto) {
    const report = await this.requireReport(reportNumber);
    return this.prisma.report.update({
      where: { id: report.id },
      data: { assignedToId: dto.assignedToId ?? null },
    });
  }

  async changeStatus(reportNumber: string, dto: ChangeReportStatusDto) {
    const report = await this.requireReport(reportNumber);
    return this.prisma.report.update({
      where: { id: report.id },
      data: {
        status: dto.status,
        resolvedAt: ['RESOLVED', 'REJECTED', 'CLOSED'].includes(dto.status)
          ? new Date()
          : null,
      },
    });
  }

  async setVerdict(reportNumber: string, dto: SetVerdictDto) {
    const report = await this.requireReport(reportNumber);
    return this.prisma.report.update({
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
      include: { moderatorNotes: { orderBy: { createdAt: 'asc' } } },
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
  ) {
    const report = await this.requireReport(reportNumber);
    await this.requireNote(report.id, noteId);
    await this.prisma.reportModeratorNote.update({
      where: { id: noteId },
      data: { content: dto.content, contentHtml: escapeToHtml(dto.content) },
    });
    return this.prisma.report.findUnique({
      where: { id: report.id },
      include: { moderatorNotes: { orderBy: { createdAt: 'asc' } } },
    });
  }

  async deleteModeratorNote(reportNumber: string, noteId: string) {
    const report = await this.requireReport(reportNumber);
    await this.requireNote(report.id, noteId);
    await this.prisma.reportModeratorNote.delete({ where: { id: noteId } });
    return this.prisma.report.findUnique({
      where: { id: report.id },
      include: { moderatorNotes: { orderBy: { createdAt: 'asc' } } },
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
      include: { moderatorNotes: { orderBy: { createdAt: 'asc' } } },
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
}
