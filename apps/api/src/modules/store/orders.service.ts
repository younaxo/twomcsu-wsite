import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { randomBytes, timingSafeEqual } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { maskNickname } from '../../common/privacy.util';
import { StorageService } from '../files/storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListAdminOrdersQueryDto } from './dto/list-admin-orders-query.dto';
import { PaymentWebhookDto } from './dto/payment-webhook.dto';
import { QuickBuyDto } from './dto/quick-buy.dto';
import { RefundOrderDto } from './dto/refund-order.dto';
import { PaymentProviderRegistry } from './payment/payment-provider.registry';
import { PricedLine, PricingService } from './pricing.service';

const ORDER_INCLUDE = {
  items: {
    include: { product: true, variant: true, bundle: true, giftToUser: true },
  },
} as const;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly payments: PaymentProviderRegistry,
    private readonly config: ConfigService,
    private readonly storage: StorageService,
  ) {}

  private async generateOrderNumber(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const randomPart = randomBytes(3).toString('hex').toUpperCase();
      const orderNumber = `O-${datePart}-${randomPart}`;
      const existing = await this.prisma.order.findUnique({
        where: { orderNumber },
      });
      if (!existing) {
        return orderNumber;
      }
    }
    throw new Error('Не удалось сгенерировать уникальный номер заказа');
  }

  private async assertNotAlreadyOwned(
    userId: string | null,
    lines: PricedLine[],
  ): Promise<void> {
    if (!userId) {
      return;
    }
    const uniqueProductIds = lines
      .filter((l) => l.isUnique && l.productId)
      .map((l) => l.productId!);
    if (uniqueProductIds.length === 0) {
      return;
    }
    const owned = await this.prisma.orderItem.findFirst({
      where: {
        productId: { in: uniqueProductIds },
        order: { userId, status: OrderStatus.COMPLETED },
      },
    });
    if (owned) {
      throw new BadRequestException(
        'Один из товаров уже куплен и недоступен для повторной покупки',
      );
    }
  }

  private async createOrderFromLines(
    userId: string | null,
    guestMinecraftNick: string | null,
    lines: PricedLine[],
    totals: {
      subtotal: Prisma.Decimal;
      discountAmount: Prisma.Decimal;
      total: Prisma.Decimal;
    },
    promoCodeId: string | null,
  ) {
    await this.assertNotAlreadyOwned(userId, lines);

    const provider = this.payments.getConfigured();
    if (!provider) {
      throw new ServiceUnavailableException(
        'Платёжный провайдер не настроен — оформление заказов временно недоступно',
      );
    }

    const orderNumber = await this.generateOrderNumber();
    const order = await this.prisma.order.create({
      data: {
        orderNumber,
        userId: userId ?? undefined,
        guestMinecraftNick: guestMinecraftNick ?? undefined,
        subtotal: totals.subtotal,
        discountAmount: totals.discountAmount,
        promoCodeId: promoCodeId ?? undefined,
        total: totals.total,
        items: {
          create: lines.map((line) => ({
            productId: line.productId ?? undefined,
            variantId: line.variantId ?? undefined,
            bundleId: line.bundleId ?? undefined,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            totalPrice: line.lineTotal,
            giftToUserId: line.giftToUserId ?? undefined,
            giftMessage: line.giftMessage ?? undefined,
          })),
        },
      },
      include: ORDER_INCLUDE,
    });

    const payment = await provider.createPayment(
      orderNumber,
      totals.total,
      `Заказ ${orderNumber}`,
    );
    const completed = await this.prisma.order.update({
      where: { id: order.id },
      data: { paymentId: payment.paymentId, paymentProvider: provider.name },
      include: ORDER_INCLUDE,
    });

    return { order: completed, paymentUrl: payment.paymentUrl };
  }

  async createFromCart(userId: string, dto: CreateOrderDto) {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: {
        promoCode: true,
        items: {
          include: {
            product: {
              select: {
                id: true,
                type: true,
                isGiftable: true,
                isSelfOnly: true,
                isUnique: true,
                name: true,
              },
            },
            variant: { select: { id: true, price: true } },
            bundle: { select: { id: true, totalPrice: true, name: true } },
          },
        },
      },
    });
    if (!cart || cart.items.length === 0) {
      throw new BadRequestException('Корзина пуста');
    }

    const totals = await this.pricing.computeTotals(
      cart.items,
      userId,
      cart.promoCode?.code ?? null,
    );
    const result = await this.createOrderFromLines(
      userId,
      dto.targetMinecraftNick ?? null,
      totals.lines,
      totals,
      cart.promoCode?.id ?? null,
    );

    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    await this.prisma.cart.update({
      where: { id: cart.id },
      data: { promoCodeId: null },
    });

    return result;
  }

  async quickBuy(dto: QuickBuyDto) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: dto.variantId },
      include: { product: true },
    });
    if (!variant || !variant.isActive || !variant.product.isActive) {
      throw new NotFoundException('Вариант товара не найден');
    }
    const quantity = dto.quantity ?? 1;
    if (
      variant.product.maxPerPurchase &&
      quantity > variant.product.maxPerPurchase
    ) {
      throw new BadRequestException(
        `Максимум ${variant.product.maxPerPurchase} шт. этого товара за покупку`,
      );
    }

    const fakeCartItem = {
      id: 'quick-buy',
      cartId: 'quick-buy',
      productId: variant.productId,
      variantId: variant.id,
      bundleId: null,
      quantity,
      giftToUserId: null,
      giftMessage: null,
      addedAt: new Date(),
      product: {
        id: variant.product.id,
        type: variant.product.type,
        isGiftable: variant.product.isGiftable,
        isSelfOnly: variant.product.isSelfOnly,
        isUnique: variant.product.isUnique,
        name: variant.product.name,
      },
      variant: { id: variant.id, price: variant.price },
      bundle: null,
    };
    const totals = await this.pricing.computeTotals([fakeCartItem], null, null);
    return this.createOrderFromLines(
      null,
      dto.guestMinecraftNick,
      totals.lines,
      totals,
      null,
    );
  }

  async listMine(userId: string) {
    const items = await this.prisma.order.findMany({
      where: { userId },
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return { items, total: items.length };
  }

  async getByOrderNumber(orderNumber: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber },
      include: ORDER_INCLUDE,
    });
    if (!order) {
      throw new NotFoundException('Заказ не найден');
    }
    if (order.userId !== userId) {
      throw new ForbiddenException('Это не ваш заказ');
    }
    return order;
  }

  async recentPurchases(): Promise<unknown[]> {
    const items = await this.prisma.orderItem.findMany({
      where: { order: { status: OrderStatus.COMPLETED } },
      include: {
        product: { select: { name: true, image: true } },
        bundle: { select: { name: true, image: true } },
        order: {
          select: { userId: true, guestMinecraftNick: true, paidAt: true },
        },
      },
      orderBy: { order: { paidAt: 'desc' } },
      take: 20,
    });
    const userIds = [
      ...new Set(
        items.map((i) => i.order.userId).filter((id): id is string => !!id),
      ),
    ];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true, avatar: true },
    });
    const userById = new Map(users.map((u) => [u.id, u]));
    // Публичная лента: ник маскируется единым алгоритмом (@twomc/shared),
    // e-mail/логин/id не отдаются.
    return items.map((i) => {
      const user = i.order.userId ? userById.get(i.order.userId) : undefined;
      return {
        productName: i.product?.name ?? i.bundle?.name ?? 'Товар',
        image: i.product?.image ?? i.bundle?.image ?? null,
        quantity: i.quantity,
        nickname: maskNickname(user?.username ?? i.order.guestMinecraftNick),
        avatar: this.storage.publicUrl(user?.avatar),
        purchasedAt: i.order.paidAt,
      };
    });
  }

  private verifyWebhookSecret(secret: string): boolean {
    const configured = this.config.get<string>('PAYMENT_WEBHOOK_SECRET') ?? '';
    const a = Buffer.from(secret);
    const b = Buffer.from(configured);
    if (a.length !== b.length) {
      return false;
    }
    return timingSafeEqual(a, b);
  }

  /// Всегда 200 (внешние провайдеры агрессивно ретраят non-2xx — та же
  /// причина, что и Voting webhook, ADR-0025). Идемпотентно: повторный
  /// вебхук для уже обработанного заказа не меняет состояние повторно.
  async handleWebhook(
    dto: PaymentWebhookDto,
  ): Promise<{ accepted: boolean; reason?: string }> {
    if (!this.verifyWebhookSecret(dto.secret)) {
      return { accepted: false, reason: 'invalid_secret' };
    }
    const order = await this.prisma.order.findUnique({
      where: { orderNumber: dto.orderNumber },
    });
    if (!order) {
      return { accepted: false, reason: 'order_not_found' };
    }
    if (order.status !== OrderStatus.PENDING) {
      return { accepted: true, reason: 'already_processed' };
    }

    if (dto.status === 'succeeded') {
      await this.prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { id: order.id },
          data: {
            status: OrderStatus.COMPLETED,
            paidAt: new Date(),
            paymentWebhookVerifiedAt: new Date(),
            paymentId: dto.paymentId,
          },
        });
        if (order.promoCodeId) {
          await tx.promoCode.update({
            where: { id: order.promoCodeId },
            data: { usedCount: { increment: 1 } },
          });
          if (order.userId) {
            await tx.promoCodeUsage.create({
              data: { promoCodeId: order.promoCodeId, userId: order.userId },
            });
          }
        }
      });
    } else {
      await this.prisma.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.FAILED },
      });
    }
    return { accepted: true };
  }

  async listAdmin(query: ListAdminOrdersQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 30;
    const where: Prisma.OrderWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { orderNumber: { contains: query.search, mode: 'insensitive' } },
              {
                guestMinecraftNick: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
              {
                user: {
                  username: { contains: query.search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: { ...ORDER_INCLUDE, user: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.order.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async stats() {
    const [total, byStatus, revenue] = await Promise.all([
      this.prisma.order.count(),
      this.prisma.order.groupBy({ by: ['status'], _count: true }),
      this.prisma.order.aggregate({
        where: { status: OrderStatus.COMPLETED },
        _sum: { total: true },
      }),
    ]);
    return {
      total,
      byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
      totalRevenue: revenue._sum.total ?? new Prisma.Decimal(0),
    };
  }

  private async requireOrder(id: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) {
      throw new NotFoundException('Заказ не найден');
    }
    return order;
  }

  async cancel(id: string, dto: CancelOrderDto) {
    const order = await this.requireOrder(id);
    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException(
        'Отменить можно только заказ в статусе PENDING',
      );
    }
    return this.prisma.order.update({
      where: { id },
      data: {
        status: OrderStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: dto.reason,
      },
    });
  }

  async refund(id: string, dto: RefundOrderDto) {
    const order = await this.requireOrder(id);
    if (order.status !== OrderStatus.COMPLETED) {
      throw new BadRequestException(
        'Возврат возможен только для завершённого заказа',
      );
    }
    return this.prisma.order.update({
      where: { id },
      data: {
        status: OrderStatus.REFUNDED,
        refundedAt: new Date(),
        cancelReason: dto.reason,
      },
    });
  }
}
