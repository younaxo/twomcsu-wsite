import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListAdminOrdersQueryDto } from '../store/dto/list-admin-orders-query.dto';
import { OrdersService } from '../store/orders.service';
import { StoreStatsService } from '../store/stats.service';

@Injectable()
export class AdminFinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly storeStats: StoreStatsService,
  ) {}

  async getContentDashboard() {
    const [
      newsByStatus,
      formsByStatus,
      pendingCommentReports,
      pendingProfileReports,
      pendingTicketReports,
      totalUsers,
      bannedUsers,
    ] = await Promise.all([
      this.prisma.news.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.form.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.commentReport.count({ where: { status: 'PENDING' } }),
      this.prisma.profileReport.count({ where: { status: 'PENDING' } }),
      this.prisma.report.count({ where: { status: 'PENDING' } }),
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isBanned: true } }),
    ]);

    return {
      news: Object.fromEntries(
        newsByStatus.map((n) => [n.status, n._count._all]),
      ),
      forms: Object.fromEntries(
        formsByStatus.map((f) => [f.status, f._count._all]),
      ),
      pendingCommentReports,
      pendingProfileReports,
      pendingTicketReports,
      totalUsers,
      bannedUsers,
    };
  }

  async getFinanceOverview() {
    return this.storeStats.getAll();
  }

  async listTransactions(query: ListAdminOrdersQueryDto) {
    return this.orders.listAdmin(query);
  }

  async listRefunds(query: Pick<ListAdminOrdersQueryDto, 'page' | 'limit'>) {
    return this.orders.listAdmin({
      ...query,
      status: OrderStatus.REFUNDED,
    });
  }
}
