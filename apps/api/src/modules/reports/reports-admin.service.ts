import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ReportType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ArchiveReportDto } from './dto/archive-report.dto';
import { BanReportsDto } from './dto/ban-reports.dto';
import { ListReportsQueryDto } from './dto/list-reports-query.dto';

@Injectable()
export class ReportsAdminService {
  constructor(private readonly prisma: PrismaService) {}

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

  async listArchived(query: ListReportsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 30;
    const where: Prisma.ReportWhereInput = {
      isArchived: true,
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        include: { author: true, targets: true },
        orderBy: { archivedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.report.count({ where }),
    ]);
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

  async banUser(userId: string, bannedBy: string, dto: BanReportsDto) {
    await this.prisma.reportBan.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    });
    return this.prisma.reportBan.create({
      data: {
        userId,
        reason: dto.reason,
        bannedBy,
        bannedUntil: dto.bannedUntil ? new Date(dto.bannedUntil) : undefined,
      },
    });
  }

  async unbanUser(userId: string): Promise<void> {
    await this.prisma.reportBan.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
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
        include: { author: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.report.count({ where }),
    ]);
    return { items, total, page, limit };
  }
}
