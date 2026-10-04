import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toCsv } from './csv.util';
import { ExportAuditDto } from './dto/export-audit.dto';
import { ExportNewsDto } from './dto/export-news.dto';
import { ExportOrdersDto } from './dto/export-orders.dto';
import { ExportReportsDto } from './dto/export-reports.dto';
import { ExportUsersDto } from './dto/export-users.dto';

export interface ExportResult {
  filename: string;
  csv: string;
}

const MAX_ROWS = 10_000;

function dateRangeFilter(
  dateFrom?: string,
  dateTo?: string,
): Prisma.DateTimeFilter | undefined {
  if (!dateFrom && !dateTo) {
    return undefined;
  }
  return {
    ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
    ...(dateTo ? { lte: new Date(dateTo) } : {}),
  };
}

/// CSV-экспорт напрямую в ответ (без файлового хранилища — CDN/файлы ещё
/// не реализованы, PHASE 23). Каждый метод ограничен MAX_ROWS строк —
/// честное ограничение, а не пагинация (экспорт — разовая выгрузка).
@Injectable()
export class ExportService {
  constructor(private readonly prisma: PrismaService) {}

  async exportUsers(dto: ExportUsersDto): Promise<ExportResult> {
    const createdAt = dateRangeFilter(dto.dateFrom, dto.dateTo);
    const users = await this.prisma.user.findMany({
      where: {
        ...(dto.q
          ? {
              OR: [
                { username: { contains: dto.q, mode: 'insensitive' } },
                { email: { contains: dto.q, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(dto.isBanned !== undefined ? { isBanned: dto.isBanned } : {}),
        ...(createdAt ? { createdAt } : {}),
      },
      select: {
        id: true,
        shortId: true,
        tag: true,
        username: true,
        email: true,
        accountType: true,
        isBanned: true,
        isVerified: true,
        createdAt: true,
        lastLoginAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_ROWS,
    });
    const columns = [
      'id',
      'shortId',
      'tag',
      'username',
      'email',
      'accountType',
      'isBanned',
      'isVerified',
      'createdAt',
      'lastLoginAt',
    ];
    return {
      filename: `users-${Date.now()}.csv`,
      csv: toCsv(users, columns),
    };
  }

  async exportOrders(dto: ExportOrdersDto): Promise<ExportResult> {
    const createdAt = dateRangeFilter(dto.dateFrom, dto.dateTo);
    const orders = await this.prisma.order.findMany({
      where: {
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.userId ? { userId: dto.userId } : {}),
        ...(createdAt ? { createdAt } : {}),
      },
      select: {
        id: true,
        orderNumber: true,
        userId: true,
        guestMinecraftNick: true,
        status: true,
        subtotal: true,
        discountAmount: true,
        total: true,
        paymentProvider: true,
        paidAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_ROWS,
    });
    const columns = [
      'id',
      'orderNumber',
      'userId',
      'guestMinecraftNick',
      'status',
      'subtotal',
      'discountAmount',
      'total',
      'paymentProvider',
      'paidAt',
      'createdAt',
    ];
    return {
      filename: `orders-${Date.now()}.csv`,
      csv: toCsv(orders, columns),
    };
  }

  async exportReports(dto: ExportReportsDto): Promise<ExportResult> {
    const createdAt = dateRangeFilter(dto.dateFrom, dto.dateTo);
    const reports = await this.prisma.report.findMany({
      where: {
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.type ? { type: dto.type } : {}),
        ...(createdAt ? { createdAt } : {}),
      },
      select: {
        id: true,
        reportNumber: true,
        type: true,
        status: true,
        authorId: true,
        server: true,
        assignedToId: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_ROWS,
    });
    const columns = [
      'id',
      'reportNumber',
      'type',
      'status',
      'authorId',
      'server',
      'assignedToId',
      'createdAt',
    ];
    return {
      filename: `reports-${Date.now()}.csv`,
      csv: toCsv(reports, columns),
    };
  }

  async exportNews(dto: ExportNewsDto): Promise<ExportResult> {
    const createdAt = dateRangeFilter(dto.dateFrom, dto.dateTo);
    const news = await this.prisma.news.findMany({
      where: {
        ...(dto.status ? { status: dto.status } : {}),
        ...(createdAt ? { createdAt } : {}),
      },
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        authorId: true,
        viewsCount: true,
        publishedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_ROWS,
    });
    const columns = [
      'id',
      'title',
      'slug',
      'status',
      'authorId',
      'viewsCount',
      'publishedAt',
      'createdAt',
    ];
    return {
      filename: `news-${Date.now()}.csv`,
      csv: toCsv(news, columns),
    };
  }

  async exportAuditLog(dto: ExportAuditDto): Promise<ExportResult> {
    const createdAt = dateRangeFilter(dto.dateFrom, dto.dateTo);
    const logs = await this.prisma.auditLog.findMany({
      where: {
        ...(dto.action ? { action: { contains: dto.action } } : {}),
        ...(dto.actorId ? { actorId: dto.actorId } : {}),
        ...(dto.severity ? { severity: dto.severity } : {}),
        ...(createdAt ? { createdAt } : {}),
      },
      select: {
        id: true,
        actorId: true,
        action: true,
        targetType: true,
        targetId: true,
        severity: true,
        ipAddress: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_ROWS,
    });
    const columns = [
      'id',
      'actorId',
      'action',
      'targetType',
      'targetId',
      'severity',
      'ipAddress',
      'createdAt',
    ];
    return {
      filename: `audit-log-${Date.now()}.csv`,
      csv: toCsv(logs, columns),
    };
  }
}
