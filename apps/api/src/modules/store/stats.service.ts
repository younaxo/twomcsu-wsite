import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StoreStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAll() {
    const [overview, salesByDay, salesByCategory, topProducts, revenueByWeek] =
      await Promise.all([
        this.overview(),
        this.salesByDay(),
        this.salesByCategory(),
        this.topProducts(),
        this.revenueByWeek(),
      ]);
    return {
      overview,
      salesByDay,
      salesByCategory,
      topProducts,
      revenueByWeek,
    };
  }

  async overview() {
    const [totalOrders, completedOrders, revenue, activeProducts] =
      await Promise.all([
        this.prisma.order.count(),
        this.prisma.order.count({ where: { status: OrderStatus.COMPLETED } }),
        this.prisma.order.aggregate({
          where: { status: OrderStatus.COMPLETED },
          _sum: { total: true },
        }),
        this.prisma.product.count({ where: { isActive: true } }),
      ]);
    return {
      totalOrders,
      completedOrders,
      totalRevenue: revenue._sum.total ?? new Prisma.Decimal(0),
      activeProducts,
    };
  }

  /// Последние 30 дней — реальная агрегация по paidAt, не моковые данные.
  async salesByDay() {
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const rows = await this.prisma.$queryRaw<
      Array<{ day: Date; revenue: Prisma.Decimal; count: bigint }>
    >`
      SELECT date_trunc('day', "paidAt") AS day, SUM("total") AS revenue, COUNT(*) AS count
      FROM "orders"
      WHERE "status" = 'COMPLETED' AND "paidAt" >= ${since}
      GROUP BY day
      ORDER BY day ASC
    `;
    return rows.map((r) => ({
      day: r.day,
      revenue: r.revenue,
      count: Number(r.count),
    }));
  }

  async salesByCategory() {
    const items = await this.prisma.orderItem.findMany({
      where: { order: { status: OrderStatus.COMPLETED } },
      select: {
        totalPrice: true,
        product: { select: { category: { select: { name: true } } } },
      },
    });
    const byCategory = new Map<string, Prisma.Decimal>();
    for (const item of items) {
      const name = item.product?.category?.name ?? 'Без категории';
      byCategory.set(
        name,
        (byCategory.get(name) ?? new Prisma.Decimal(0)).plus(item.totalPrice),
      );
    }
    return [...byCategory.entries()]
      .map(([category, revenue]) => ({ category, revenue }))
      .sort((a, b) => b.revenue.comparedTo(a.revenue));
  }

  async topProducts() {
    const items = await this.prisma.orderItem.findMany({
      where: {
        order: { status: OrderStatus.COMPLETED },
        productId: { not: null },
      },
      select: {
        productId: true,
        quantity: true,
        totalPrice: true,
        product: { select: { name: true } },
      },
    });
    const byProduct = new Map<
      string,
      { name: string; quantity: number; revenue: Prisma.Decimal }
    >();
    for (const item of items) {
      if (!item.productId) continue;
      const existing = byProduct.get(item.productId);
      if (existing) {
        existing.quantity += item.quantity;
        existing.revenue = existing.revenue.plus(item.totalPrice);
      } else {
        byProduct.set(item.productId, {
          name: item.product?.name ?? 'Товар',
          quantity: item.quantity,
          revenue: item.totalPrice,
        });
      }
    }
    return [...byProduct.values()]
      .sort((a, b) => b.revenue.comparedTo(a.revenue))
      .slice(0, 10);
  }

  /// Последние 12 недель.
  async revenueByWeek() {
    const since = new Date();
    since.setDate(since.getDate() - 84);
    const rows = await this.prisma.$queryRaw<
      Array<{ week: Date; revenue: Prisma.Decimal }>
    >`
      SELECT date_trunc('week', "paidAt") AS week, SUM("total") AS revenue
      FROM "orders"
      WHERE "status" = 'COMPLETED' AND "paidAt" >= ${since}
      GROUP BY week
      ORDER BY week ASC
    `;
    return rows.map((r) => ({ week: r.week, revenue: r.revenue }));
  }
}
