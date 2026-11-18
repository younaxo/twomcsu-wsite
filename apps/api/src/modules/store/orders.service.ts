import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DeliveryTaskStatus, OrderStatus, Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import {
  isDateRangeInverted,
  parseDateRange,
} from '../../common/date-range.util';
import { maskNickname } from '../../common/privacy.util';
import { AuditService } from '../audit/audit.service';
import {
  BuyerDeliveryStatus,
  buyerDeliveryStatus,
} from '../delivery/delivery-status';
import { DeliveryService } from '../delivery/delivery.service';
import { StorageService } from '../files/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_USER_SELECT } from '../users/public-user';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListAdminOrdersQueryDto } from './dto/list-admin-orders-query.dto';
import { ListMyOrdersQueryDto } from './dto/list-my-orders-query.dto';
import { QuickBuyDto } from './dto/quick-buy.dto';
import { RefundOrderDto } from './dto/refund-order.dto';
import {
  PaymentProvider,
  PaymentWebhookEvent,
} from './payment/payment-provider.interface';
import { PaymentProviderRegistry } from './payment/payment-provider.registry';
import { assertCartLimits, CartLimitLine } from './cart-limits';
import { CART_ITEM_INCLUDE } from './cart.service';
import { PricedLine, PricingService } from './pricing.service';
import {
  PUBLIC_PRODUCT_BRIEF_SELECT,
  PUBLIC_VARIANT_SELECT,
} from './public-product';
import { CheckoutPolicyService } from './checkout-policy.service';
import { badRequest, paymentUnavailable, StoreCartError } from './store-errors';

function limitLinesOf(lines: PricedLine[]): CartLimitLine[] {
  return lines.map((l) => ({
    productId: l.productId,
    productName: l.name,
    quantity: l.quantity,
    isUnique: l.isUnique,
    maxPerPurchase: l.maxPerPurchase,
  }));
}

/// Заказ для покупателя: товар — по белому списку (без gameCommands и прочих
/// служебных полей), получатель подарка — только публичные поля (ADR-0107).
const ORDER_INCLUDE = {
  items: {
    include: {
      product: { select: PUBLIC_PRODUCT_BRIEF_SELECT },
      variant: { select: PUBLIC_VARIANT_SELECT },
      bundle: {
        select: { id: true, name: true, slug: true, image: true },
      },
      giftToUser: { select: PUBLIC_USER_SELECT },
      // Только статусы: из них считается деталь-свободный статус выдачи (0.7).
      deliveryTasks: { select: { status: true } },
    },
  },
} as const;

/// Внутренние платёжные поля заказа: покупателю не отдаются (0.6, N1 ревью S1).
/// Статус оплаты и время — `status` и `paidAt`.
const BUYER_HIDDEN_ORDER_FIELDS = [
  'paymentId',
  'paymentProvider',
  'paymentWebhookVerifiedAt',
  'promoCodeId',
] as const;

type BuyerItems<T> = T extends { items: readonly (infer I)[] }
  ? {
      items: Array<
        Omit<I, 'deliveryTasks'> & {
          deliveryStatus: BuyerDeliveryStatus | null;
        }
      >;
    }
  : unknown;

export type BuyerOrder<T> = Omit<
  T,
  (typeof BUYER_HIDDEN_ORDER_FIELDS)[number] | 'items'
> & { deliveryStatus: BuyerDeliveryStatus | null } & BuyerItems<T>;

/// Ответ покупателю: заказ без внутренних платёжных полей и со статусом
/// выдачи (0.7): `pending` | `delivered` | `failed` — без внутренних деталей
/// (исполнитель, попытки, ошибки не отдаются). Для незавершённого заказа
/// статус выдачи `null`. Админские эндпоинты этим не пользуются.
export function toBuyerOrder<T extends object>(order: T): BuyerOrder<T> {
  const copy = { ...order } as Record<string, unknown>;
  for (const field of BUYER_HIDDEN_ORDER_FIELDS) {
    delete copy[field];
  }
  const completed = copy.status === OrderStatus.COMPLETED;
  const allStatuses: DeliveryTaskStatus[] = [];
  if (Array.isArray(copy.items)) {
    copy.items = copy.items.map((raw: Record<string, unknown>) => {
      const { deliveryTasks, ...rest } = raw;
      const statuses = Array.isArray(deliveryTasks)
        ? (deliveryTasks as Array<{ status: DeliveryTaskStatus }>).map(
            (t) => t.status,
          )
        : [];
      allStatuses.push(...statuses);
      return {
        ...rest,
        deliveryStatus: completed ? buyerDeliveryStatus(statuses) : null,
      };
    });
  }
  copy.deliveryStatus = completed ? buyerDeliveryStatus(allStatuses) : null;
  return copy as unknown as BuyerOrder<T>;
}

/// Позиция заказа для админки (0.4, ревью S1): только нужное карточке заказа.
/// Скалярные поля позиции сохранены (контракт AdminOrderDto); товар, вариант и
/// набор — по белому списку (без gameCommands, server, цен закупки и прочих
/// служебных полей); получатель подарка — публичные поля (ADR-0107).
const ADMIN_ORDER_ITEM_SELECT = {
  id: true,
  orderId: true,
  productId: true,
  variantId: true,
  bundleId: true,
  quantity: true,
  unitPrice: true,
  totalPrice: true,
  giftToUserId: true,
  giftMessage: true,
  isDelivered: true,
  deliveredAt: true,
  product: { select: { id: true, name: true, slug: true, type: true } },
  variant: { select: { id: true, duration: true, price: true } },
  bundle: { select: { id: true, name: true, slug: true } },
  giftToUser: { select: PUBLIC_USER_SELECT },
} satisfies Prisma.OrderItemSelect;

/// Покупатель для админки: публичные поля и email (ADR-0133), без IP и прочего.
const ADMIN_ORDER_USER_SELECT = {
  ...PUBLIC_USER_SELECT,
  email: true,
} satisfies Prisma.UserSelect;

const ADMIN_ORDER_INCLUDE = {
  items: { select: ADMIN_ORDER_ITEM_SELECT, orderBy: { id: 'asc' } },
  user: { select: ADMIN_ORDER_USER_SELECT },
} satisfies Prisma.OrderInclude;

/// Карточка заказа: к списочному составу добавляется промокод (без служебных
/// счётчиков использований).
const ADMIN_ORDER_CARD_INCLUDE = {
  ...ADMIN_ORDER_INCLUDE,
  promoCode: {
    select: {
      id: true,
      code: true,
      discountType: true,
      discountValue: true,
    },
  },
} satisfies Prisma.OrderInclude;

const MAX_SEARCH_LENGTH = 100;

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly payments: PaymentProviderRegistry,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly checkout: CheckoutPolicyService,
    private readonly delivery: DeliveryService,
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
      throw badRequest(
        StoreCartError.CART_UNIQUE_ALREADY_OWNED,
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
    acceptedOfferVersion: string | undefined,
  ) {
    // Провайдера нет (production без PAYMENT_PROVIDER) — честный 503 ДО любой
    // записи: «висячих» PENDING-заказов без платежа не появляется.
    const provider = this.payments.getConfigured();
    if (!provider) {
      throw paymentUnavailable();
    }
    const offer = await this.checkout.assertOfferAccepted(acceptedOfferVersion);
    const recipientNick = await this.checkout.resolveRecipientNick(
      userId,
      guestMinecraftNick ?? undefined,
    );
    await this.assertNotAlreadyOwned(userId, lines);

    const orderNumber = await this.generateOrderNumber();
    const order = await this.prisma.order.create({
      data: {
        orderNumber,
        userId: userId ?? undefined,
        guestMinecraftNick: recipientNick,
        offerVersion: offer.offerVersion,
        offerAcceptedAt: offer.offerAcceptedAt,
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

    let payment: Awaited<ReturnType<PaymentProvider['createPayment']>>;
    try {
      payment = await provider.createPayment(
        orderNumber,
        totals.total,
        `Заказ ${orderNumber}`,
      );
    } catch (error) {
      // Платёж не создан: заказ не остаётся PENDING без платежа.
      this.logger.warn(
        `Не удалось создать платёж ${orderNumber}: ${(error as Error).message}`,
      );
      await this.prisma.order.updateMany({
        where: { id: order.id, status: OrderStatus.PENDING },
        data: { status: OrderStatus.FAILED },
      });
      throw paymentUnavailable();
    }
    const completed = await this.prisma.order.update({
      where: { id: order.id },
      data: { paymentId: payment.paymentId, paymentProvider: provider.name },
      include: ORDER_INCLUDE,
    });

    return { order: toBuyerOrder(completed), paymentUrl: payment.paymentUrl };
  }

  async createFromCart(userId: string, dto: CreateOrderDto) {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: {
        promoCode: true,
        items: {
          include: CART_ITEM_INCLUDE,
          orderBy: { addedAt: 'asc' },
        },
      },
    });
    if (!cart || cart.items.length === 0) {
      throw new BadRequestException('Корзина пуста');
    }

    // Недействительный сохранённый промокод здесь — 4xx с кодом PROMO_*, а не
    // молчаливое повышение суммы (в корзине причина видна в promoError).
    const totals = await this.pricing.computeTotals(
      cart.items,
      userId,
      cart.promoCode?.code ?? null,
    );
    // Лимиты товара (isUnique/maxPerPurchase) — по строкам корзины целиком,
    // даже если дубли появились в обход API корзины.
    assertCartLimits(limitLinesOf(totals.lines));
    const result = await this.createOrderFromLines(
      userId,
      dto.targetMinecraftNick ?? null,
      totals.lines,
      totals,
      cart.promoCode?.id ?? null,
      dto.offerVersion,
    );

    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    await this.prisma.cart.update({
      where: { id: cart.id },
      data: { promoCodeId: null },
    });

    return result;
  }

  async quickBuy(dto: QuickBuyDto) {
    this.checkout.assertQuickBuyEnabled();
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: dto.variantId },
      include: { product: true },
    });
    if (!variant || !variant.isActive || !variant.product.isActive) {
      throw new NotFoundException('Вариант товара не найден');
    }
    const quantity = dto.quantity ?? 1;

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
        maxPerPurchase: variant.product.maxPerPurchase,
        name: variant.product.name,
      },
      variant: { id: variant.id, price: variant.price },
      bundle: null,
    };
    const priced = await this.pricing.computeTotals([fakeCartItem], null, null);
    // Без корзины строки нет: cartItemId = null (CartLineRef).
    const totals = {
      ...priced,
      lines: priced.lines.map((l) => ({ ...l, cartItemId: null })),
    };
    assertCartLimits(limitLinesOf(totals.lines));
    return this.createOrderFromLines(
      null,
      dto.guestMinecraftNick,
      totals.lines,
      totals,
      null,
      dto.offerVersion,
    );
  }

  /// Публичные параметры оформления для страницы /shop/checkout (0.5): версия
  /// оферты, доступна ли оплата (иначе клиент показывает 503-состояние с
  /// неактивной кнопкой) и включён ли анонимный quick-buy. Без секретов.
  async checkoutConfig() {
    return {
      offerVersion: await this.checkout.currentOfferVersion(),
      paymentAvailable: this.payments.getConfigured() !== undefined,
      quickBuyEnabled: this.checkout.isQuickBuyEnabled(),
    };
  }

  /// Только заказы текущего пользователя (`userId` из токена, не из запроса).
  async listMine(userId: string, query: ListMyOrdersQueryDto = {}) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.OrderWhereInput = {
      userId,
      ...(query.status ? { status: query.status } : {}),
    };
    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: ORDER_INCLUDE,
        // Второй ключ — стабильная пагинация при одинаковом createdAt.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.order.count({ where }),
    ]);
    return { items: orders.map((o) => toBuyerOrder(o)), total, page, limit };
  }

  async getByOrderNumber(orderNumber: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber },
      include: ORDER_INCLUDE,
    });
    // Чужой и гостевой (userId = NULL) заказ неотличим от несуществующего:
    // тот же 404 и то же тело, номер заказа не подтверждается постороннему.
    if (!order || order.userId === null || order.userId !== userId) {
      throw new NotFoundException('Заказ не найден');
    }
    return toBuyerOrder(order);
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

  /// ADR-0157. Подпись уже проверена провайдером (PaymentsWebhookController).
  /// Всегда 200 для проверенных событий (внешние провайдеры агрессивно
  /// ретраят non-2xx, ADR-0025). Идемпотентно и безопасно при конкуренции:
  /// переход статуса — атомарный `updateMany where {id, status: PENDING}`;
  /// побочные эффекты (usedCount) выполняются только если переход состоялся.
  /// Поздний `succeeded` по заказу в CANCELLED/FAILED (0.4, ревью M1): деньги
  /// могли списаться, а заказ не выполняется. Статус и цену НЕ меняем —
  /// фиксируем событие для ручного разбора (возврат средств). Только
  /// orderNumber, paymentId, provider — без ПДн и секретов. Сбой наблюдения не
  /// должен ломать ответ вебхука (иначе провайдер зациклит ретраи).
  private async reportLatePayment(
    order: { id: string; orderNumber: string; status: OrderStatus },
    event: PaymentWebhookEvent,
    provider: PaymentProvider,
  ): Promise<void> {
    this.logger.warn(
      `Поздняя оплата заказа ${order.orderNumber} в статусе ${order.status}: paymentId=${event.paymentId} provider=${provider.name}`,
    );
    try {
      const system = await this.prisma.user.findFirst({
        where: { accountType: 'SYSTEM' },
        select: { id: true },
      });
      if (system) {
        await this.audit.log({
          actorId: system.id,
          action: 'orders.order.late_payment',
          targetType: 'order',
          targetId: order.id,
          changes: {
            orderNumber: order.orderNumber,
            orderStatus: order.status,
            paymentId: event.paymentId,
            provider: provider.name,
          },
          severity: 'warning',
        });
      } else {
        this.logger.warn(
          'Аудит поздней оплаты пропущен: нет системного аккаунта',
        );
      }
      const staff = await this.prisma.user.findMany({
        where: {
          isBanned: false,
          accountType: { not: 'SYSTEM' },
          roles: {
            some: {
              role: {
                OR: [
                  { isSuperuser: true },
                  {
                    permissions: {
                      some: {
                        effect: 'ALLOW',
                        permission: { key: 'orders.view' },
                      },
                    },
                  },
                ],
              },
            },
          },
        },
        select: { id: true },
        take: 50,
      });
      await Promise.all(
        staff.map((u) =>
          this.notifications.create({
            userId: u.id,
            type: 'SYSTEM',
            title: 'Поздняя оплата отменённого заказа',
            message: `Заказ ${order.orderNumber} (${order.status}) получил успешную оплату. Проверьте и при необходимости оформите возврат.`,
            priority: 'HIGH',
            bypassPreferences: true,
          }),
        ),
      );
    } catch (error) {
      this.logger.warn(
        `Не удалось зафиксировать позднюю оплату ${order.orderNumber}: ${(error as Error).message}`,
      );
    }
  }

  async handleWebhook(
    provider: PaymentProvider,
    event: PaymentWebhookEvent,
  ): Promise<{ accepted: boolean; reason?: string }> {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber: event.orderNumber },
    });
    if (!order) {
      return { accepted: false, reason: 'order_not_found' };
    }
    if (order.paymentProvider !== provider.name) {
      this.logger.warn(
        `Webhook rejected: order=${order.id} provider=${provider.name} reason=provider_mismatch`,
      );
      return { accepted: false, reason: 'provider_mismatch' };
    }
    if (order.status !== OrderStatus.PENDING) {
      if (
        event.status === 'succeeded' &&
        (order.status === OrderStatus.CANCELLED ||
          order.status === OrderStatus.FAILED)
      ) {
        await this.reportLatePayment(order, event, provider);
      }
      return { accepted: true, reason: 'already_processed' };
    }
    if (order.paymentId && order.paymentId !== event.paymentId) {
      this.logger.warn(
        `Webhook rejected: order=${order.id} provider=${provider.name} reason=payment_id_mismatch`,
      );
      return { accepted: false, reason: 'payment_id_mismatch' };
    }

    if (event.status === 'succeeded') {
      if (event.currency !== provider.currency) {
        this.logger.warn(
          `Webhook rejected: order=${order.id} provider=${provider.name} reason=currency_mismatch`,
        );
        return { accepted: false, reason: 'currency_mismatch' };
      }
      if (!event.amount.equals(order.total)) {
        this.logger.warn(
          `Webhook rejected: order=${order.id} provider=${provider.name} reason=amount_mismatch`,
        );
        return { accepted: false, reason: 'amount_mismatch' };
      }
      const transitioned = await this.prisma.$transaction(async (tx) => {
        const now = new Date();
        const moved = await tx.order.updateMany({
          where: { id: order.id, status: OrderStatus.PENDING },
          data: {
            status: OrderStatus.COMPLETED,
            paidAt: now,
            paymentWebhookVerifiedAt: now,
            ...(order.paymentId ? {} : { paymentId: event.paymentId }),
          },
        });
        if (moved.count !== 1) {
          return false;
        }
        if (order.promoCodeId) {
          await tx.promoCode.update({
            where: { id: order.promoCodeId },
            data: { usedCount: { increment: 1 } },
          });
          if (order.userId) {
            await tx.promoCodeUsage.createMany({
              data: [{ promoCodeId: order.promoCodeId, userId: order.userId }],
              skipDuplicates: true,
            });
          }
        }
        // Outbox (ADR-0184 п. 3): задания выдачи в той же транзакции, только
        // при moved.count === 1. Повторный вебхук сюда не доходит.
        await this.delivery.createTasksForOrder(tx, order.id);
        return true;
      });
      return transitioned
        ? { accepted: true }
        : { accepted: true, reason: 'already_processed' };
    }

    const failed = await this.prisma.order.updateMany({
      where: { id: order.id, status: OrderStatus.PENDING },
      data: { status: OrderStatus.FAILED },
    });
    return failed.count === 1
      ? { accepted: true }
      : { accepted: true, reason: 'already_processed' };
  }

  async listAdmin(query: ListAdminOrdersQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 30;
    if (isDateRangeInverted(query.dateFrom, query.dateTo)) {
      throw new BadRequestException('dateFrom не может быть позже dateTo');
    }
    const createdAtRange = parseDateRange(query.dateFrom, query.dateTo);
    const search = query.search?.trim().slice(0, MAX_SEARCH_LENGTH);
    const orderNumber = query.orderNumber?.trim();
    const nickname = query.nickname?.trim();
    const where: Prisma.OrderWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(orderNumber
        ? { orderNumber: { contains: orderNumber, mode: 'insensitive' } }
        : {}),
      ...(nickname
        ? {
            OR: [
              {
                guestMinecraftNick: { contains: nickname, mode: 'insensitive' },
              },
              {
                user: { username: { contains: nickname, mode: 'insensitive' } },
              },
            ],
          }
        : {}),
      ...(createdAtRange ? { createdAt: createdAtRange } : {}),
      ...(search
        ? {
            AND: [
              {
                OR: [
                  { orderNumber: { contains: search, mode: 'insensitive' } },
                  {
                    guestMinecraftNick: {
                      contains: search,
                      mode: 'insensitive',
                    },
                  },
                  {
                    user: {
                      username: { contains: search, mode: 'insensitive' },
                    },
                  },
                ],
              },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: ADMIN_ORDER_INCLUDE,
        // Второй ключ — стабильная пагинация при одинаковом createdAt.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.order.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  /// Карточка заказа для админки: по id или по номеру заказа. Событий вебхука
  /// в БД нет (хранится только итог: `paymentWebhookVerifiedAt`, `paidAt`,
  /// `paymentId`, `paymentProvider`), поэтому секция `payment` — это сводка по
  /// этим полям; подпись и тело вебхука не хранятся и не отдаются.
  async getAdminCard(idOrNumber: string) {
    const order = await this.prisma.order.findFirst({
      where: { OR: [{ id: idOrNumber }, { orderNumber: idOrNumber }] },
      include: ADMIN_ORDER_CARD_INCLUDE,
    });
    if (!order) {
      throw new NotFoundException('Заказ не найден');
    }
    return {
      ...order,
      payment: {
        provider: order.paymentProvider,
        paymentId: order.paymentId,
        isPaid: order.status === OrderStatus.COMPLETED && !!order.paidAt,
        paidAt: order.paidAt,
        webhookVerifiedAt: order.paymentWebhookVerifiedAt,
      },
    };
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

  /// Отмена только PENDING (0.4). Статус перечитывается под блокировкой строки
  /// (FOR UPDATE): параллельный вебхук оплаты не пройдёт между проверкой и
  /// записью. Оплаченный/завершённый/возвращённый/неуспешный заказ — 409.
  /// Аудит — в той же транзакции и строгий: сбой записи откатывает отмену.
  /// Причина хранится в `Order.cancelReason` и в аудите.
  async cancel(id: string, dto: CancelOrderDto, actorId: string) {
    const reason = dto.reason.trim();
    if (!reason) {
      throw new BadRequestException('Причина отмены обязательна');
    }
    return this.prisma.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM orders WHERE id = ${id} FOR UPDATE`;
        if (locked.length === 0) {
          throw new NotFoundException('Заказ не найден');
        }
        const order = await tx.order.findUniqueOrThrow({ where: { id } });
        if (order.status !== OrderStatus.PENDING) {
          throw new ConflictException({
            code: 'ORDER_NOT_CANCELLABLE',
            message: `Отменить можно только заказ в статусе PENDING, текущий статус: ${order.status}`,
          });
        }
        const updated = await tx.order.update({
          where: { id },
          data: {
            status: OrderStatus.CANCELLED,
            cancelledAt: new Date(),
            cancelReason: reason,
          },
        });
        await this.audit.log({
          actorId,
          action: 'orders.order.cancelled',
          targetType: 'order',
          targetId: id,
          changes: {
            orderNumber: order.orderNumber,
            from: order.status,
            to: OrderStatus.CANCELLED,
            total: order.total.toFixed(2),
            reason,
          },
          severity: 'warning',
          tx,
          strict: true,
        });
        return updated;
      },
      { maxWait: 10_000, timeout: 10_000 },
    );
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
