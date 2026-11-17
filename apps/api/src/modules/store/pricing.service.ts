import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CartItem,
  DiscountType,
  OrderStatus,
  Prisma,
  PromoCode,
  ProductType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  badRequest,
  CartPromoError,
  notFound,
  StoreCartError,
  toPromoError,
} from './store-errors';

export interface PricedLine {
  /// id строки корзины (для быстрой покупки — условный).
  cartItemId: string | null;
  productId: string | null;
  variantId: string | null;
  bundleId: string | null;
  productType: ProductType | null;
  quantity: number;
  unitPrice: Prisma.Decimal;
  lineSubtotal: Prisma.Decimal;
  bulkDiscount: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
  giftToUserId: string | null;
  giftMessage: string | null;
  isGiftable: boolean;
  isSelfOnly: boolean;
  isUnique: boolean;
  maxPerPurchase: number | null;
  name: string;
}

export interface PricingResult {
  lines: PricedLine[];
  subtotal: Prisma.Decimal;
  bulkDiscountTotal: Prisma.Decimal;
  loyaltyDiscountPercent: Prisma.Decimal;
  loyaltyDiscountTotal: Prisma.Decimal;
  promoDiscountTotal: Prisma.Decimal;
  /// Сохранённый промокод сейчас не действует (только режим softPromo).
  promoError: CartPromoError | null;
  discountAmount: Prisma.Decimal;
  total: Prisma.Decimal;
}

type CartItemWithRelations = CartItem & {
  product: {
    id: string;
    type: ProductType;
    isGiftable: boolean;
    isSelfOnly: boolean;
    isUnique: boolean;
    maxPerPurchase?: number | null;
    name: string;
  } | null;
  variant: { id: string; price: Prisma.Decimal } | null;
  bundle: { id: string; totalPrice: Prisma.Decimal; name: string } | null;
};

/// Пересчёт стоимости корзины/заказа — единая точка, используемая и
/// CartService.calculate(), и OrdersService.createFromCart()/quickBuy()
/// (ADR-0009: итог заказа всегда пересчитывается сервером, клиентские цены
/// не доверяются).
@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  async getLoyaltyDiscountPercent(
    userId: string | null,
  ): Promise<Prisma.Decimal> {
    if (!userId) {
      return new Prisma.Decimal(0);
    }
    const completedOrders = await this.prisma.order.count({
      where: { userId, status: OrderStatus.COMPLETED },
    });
    const tiers = await this.prisma.loyaltyDiscount.findMany({
      where: { isActive: true, minPurchases: { lte: completedOrders } },
      orderBy: { minPurchases: 'desc' },
      take: 1,
    });
    return tiers[0] ? tiers[0].discountPercent : new Prisma.Decimal(0);
  }

  private async getBulkDiscount(
    productId: string,
    productType: ProductType,
    quantity: number,
    lineAmount: Prisma.Decimal,
  ) {
    const candidates = await this.prisma.bulkDiscount.findMany({
      where: {
        isActive: true,
        OR: [{ productId }, { productId: null, productType }],
        minQuantity: { lte: quantity },
        AND: [
          {
            OR: [
              { minAmount: null },
              { minAmount: { lte: lineAmount.toNumber() } },
            ],
          },
        ],
      },
    });
    if (candidates.length === 0) {
      return new Prisma.Decimal(0);
    }
    const amounts = candidates.map((c) =>
      c.discountType === DiscountType.PERCENT
        ? lineAmount.times(c.discountValue).dividedBy(100)
        : Prisma.Decimal.min(c.discountValue, lineAmount),
    );
    return amounts.reduce((best, current) =>
      current.greaterThan(best) ? current : best,
    );
  }

  async priceLines(items: CartItemWithRelations[]): Promise<{
    lines: PricedLine[];
    subtotal: Prisma.Decimal;
    bulkDiscountTotal: Prisma.Decimal;
  }> {
    const lines: PricedLine[] = [];
    let subtotal = new Prisma.Decimal(0);
    let bulkDiscountTotal = new Prisma.Decimal(0);

    for (const item of items) {
      let unitPrice: Prisma.Decimal;
      let name: string;
      let productType: ProductType | null = null;
      let isGiftable = true;
      let isSelfOnly = false;
      let isUnique = false;
      let maxPerPurchase: number | null = null;

      if (item.bundle) {
        unitPrice = item.bundle.totalPrice;
        name = item.bundle.name;
      } else if (item.variant && item.product) {
        unitPrice = item.variant.price;
        name = item.product.name;
        productType = item.product.type;
        isGiftable = item.product.isGiftable;
        isSelfOnly = item.product.isSelfOnly;
        isUnique = item.product.isUnique;
        maxPerPurchase = item.product.maxPerPurchase ?? null;
      } else {
        throw new BadRequestException(
          'Некорректная позиция корзины: не указан товар или набор',
        );
      }

      const lineSubtotal = unitPrice.times(item.quantity);
      const bulkDiscount =
        item.product && productType
          ? await this.getBulkDiscount(
              item.product.id,
              productType,
              item.quantity,
              lineSubtotal,
            )
          : new Prisma.Decimal(0);
      const lineTotal = lineSubtotal.minus(bulkDiscount);

      subtotal = subtotal.plus(lineSubtotal);
      bulkDiscountTotal = bulkDiscountTotal.plus(bulkDiscount);

      lines.push({
        cartItemId: item.id,
        productId: item.productId,
        variantId: item.variantId,
        bundleId: item.bundleId,
        productType,
        quantity: item.quantity,
        unitPrice,
        lineSubtotal,
        bulkDiscount,
        lineTotal,
        giftToUserId: item.giftToUserId,
        giftMessage: item.giftMessage,
        isGiftable,
        isSelfOnly,
        isUnique,
        maxPerPurchase,
        name,
      });
    }

    return { lines, subtotal, bulkDiscountTotal };
  }

  /// `subtotalAfterBulk`/`productTypes` отсутствуют => эти две проверки
  /// пропускаются — используется для standalone `POST /store/promocodes/
  /// validate` (нет контекста корзины), с полным контекстом — при
  /// calculate()/applyPromo()/оформлении заказа.
  async requireValidPromoCode(
    code: string,
    userId: string | null,
    options: {
      subtotalAfterBulk?: Prisma.Decimal;
      productTypes?: ProductType[];
    } = {},
  ): Promise<PromoCode> {
    const promo = await this.prisma.promoCode.findUnique({
      where: { code: code.toUpperCase() },
    });
    if (!promo || !promo.isActive) {
      throw notFound(StoreCartError.PROMO_NOT_FOUND, 'Промокод не найден');
    }
    const now = new Date();
    if (promo.validFrom && promo.validFrom > now) {
      throw badRequest(
        StoreCartError.PROMO_NOT_STARTED,
        'Промокод ещё не активен',
      );
    }
    if (promo.validUntil && promo.validUntil < now) {
      throw badRequest(
        StoreCartError.PROMO_EXPIRED,
        'Срок действия промокода истёк',
      );
    }
    if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) {
      throw badRequest(StoreCartError.PROMO_EXHAUSTED, 'Промокод исчерпан');
    }
    if (
      options.productTypes &&
      promo.applicableToTypes.length > 0 &&
      !options.productTypes.some((t) => promo.applicableToTypes.includes(t))
    ) {
      throw badRequest(
        StoreCartError.PROMO_NOT_APPLICABLE,
        'Промокод неприменим к товарам в корзине',
      );
    }
    if (
      options.subtotalAfterBulk !== undefined &&
      promo.minOrderAmount &&
      options.subtotalAfterBulk.lessThan(promo.minOrderAmount)
    ) {
      throw badRequest(
        StoreCartError.PROMO_MIN_AMOUNT,
        'Сумма заказа меньше минимальной для этого промокода',
      );
    }
    if (promo.firstPurchaseOnly && userId) {
      const completedOrders = await this.prisma.order.count({
        where: { userId, status: OrderStatus.COMPLETED },
      });
      if (completedOrders > 0) {
        throw badRequest(
          StoreCartError.PROMO_FIRST_PURCHASE_ONLY,
          'Промокод только для первой покупки',
        );
      }
    }
    return promo;
  }

  computePromoDiscount(
    promo: PromoCode,
    amount: Prisma.Decimal,
  ): Prisma.Decimal {
    return promo.discountType === DiscountType.PERCENT
      ? amount.times(promo.discountValue).dividedBy(100)
      : Prisma.Decimal.min(promo.discountValue, amount);
  }

  async computeTotals(
    items: CartItemWithRelations[],
    userId: string | null,
    promoCode: string | null,
    /// softPromo: отказ промокода не бросает ошибку, а возвращается в promoError
    /// (корзина без скидки по промокоду). Без флага — 4xx с кодом PROMO_*.
    options: { softPromo?: boolean } = {},
  ): Promise<PricingResult> {
    const { lines, subtotal, bulkDiscountTotal } = await this.priceLines(items);
    const afterBulk = subtotal.minus(bulkDiscountTotal);

    const loyaltyDiscountPercent = await this.getLoyaltyDiscountPercent(userId);
    const loyaltyDiscountTotal = afterBulk
      .times(loyaltyDiscountPercent)
      .dividedBy(100);
    const afterLoyalty = afterBulk.minus(loyaltyDiscountTotal);

    let promoDiscountTotal = new Prisma.Decimal(0);
    let promoError: CartPromoError | null = null;
    if (promoCode) {
      const productTypes = lines
        .map((l) => l.productType)
        .filter((t): t is ProductType => t !== null);
      try {
        const promo = await this.requireValidPromoCode(promoCode, userId, {
          subtotalAfterBulk: afterLoyalty,
          productTypes,
        });
        promoDiscountTotal = this.computePromoDiscount(promo, afterLoyalty);
      } catch (error) {
        const known = toPromoError(error);
        if (!options.softPromo || !known) {
          throw error;
        }
        promoError = known;
      }
    }

    const discountAmount = bulkDiscountTotal
      .plus(loyaltyDiscountTotal)
      .plus(promoDiscountTotal);
    const total = subtotal.minus(discountAmount);

    return {
      lines,
      subtotal,
      bulkDiscountTotal,
      loyaltyDiscountPercent,
      loyaltyDiscountTotal,
      promoDiscountTotal,
      promoError,
      discountAmount,
      total: total.greaterThan(0) ? total : new Prisma.Decimal(0),
    };
  }
}
