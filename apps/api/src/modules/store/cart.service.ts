import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { CalculateCartDto } from './dto/calculate-cart.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { PrismaService } from '../prisma/prisma.service';
import { assertCartLimits, CartLimitLine } from './cart-limits';
import { PricingService } from './pricing.service';
import {
  badRequest,
  notFound,
  StoreCartError,
  toPromoError,
} from './store-errors';

export const CART_ITEM_INCLUDE = {
  product: {
    select: {
      id: true,
      type: true,
      isGiftable: true,
      isSelfOnly: true,
      isUnique: true,
      maxPerPurchase: true,
      name: true,
    },
  },
  variant: { select: { id: true, price: true } },
  bundle: { select: { id: true, totalPrice: true, name: true } },
} as const;

/// Публичные поля промокода в ответе корзины (N2): без лимитов, счётчиков и
/// условий (maxUses/usedCount/minOrderAmount/firstPurchaseOnly и т.п.).
function toPublicPromo(
  promo: {
    code: string;
    description: string | null;
    discountType: string;
    discountValue: Prisma.Decimal;
  } | null,
) {
  return promo
    ? {
        code: promo.code,
        description: promo.description,
        discountType: promo.discountType,
        discountValue: promo.discountValue,
      }
    : null;
}

const LOCKED_ITEM_INCLUDE = {
  product: {
    select: { id: true, name: true, isUnique: true, maxPerPurchase: true },
  },
} as const;

type LockedItem = Prisma.CartItemGetPayload<{
  include: typeof LOCKED_ITEM_INCLUDE;
}>;

function limitLine(item: LockedItem): CartLimitLine {
  return {
    productId: item.productId,
    productName: item.product?.name ?? '',
    quantity: item.quantity,
    isUnique: item.product?.isUnique ?? false,
    maxPerPurchase: item.product?.maxPerPurchase ?? null,
  };
}

interface LineKey {
  variantId: string | null;
  bundleId: string | null;
  giftToUserId: string | null;
}

/// Одинаковая позиция: тот же вариант/набор и тот же получатель подарка.
function sameLine(a: LineKey, b: LineKey): boolean {
  return (
    a.variantId === b.variantId &&
    a.bundleId === b.bundleId &&
    a.giftToUserId === b.giftToUserId
  );
}

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
  ) {}

  private async requireCart(userId: string) {
    return this.prisma.cart.upsert({
      where: { userId },
      create: { userId },
      update: {},
      include: { items: { include: CART_ITEM_INCLUDE }, promoCode: true },
    });
  }

  /// Ответ корзины: расчёт + публичные поля. Сохранённый промокод, который
  /// перестал действовать, не роняет ответ: скидки нет, причина — в promoError
  /// (код остаётся привязанным, пользователь может снять его или вернуть
  /// условия — например, добавить товары до минимальной суммы).
  private async buildCartView(
    userId: string,
    cart: Awaited<ReturnType<CartService['requireCart']>>,
    previewCode?: string,
  ) {
    const totals = await this.pricing.computeTotals(
      cart.items,
      userId,
      previewCode ?? cart.promoCode?.code ?? null,
      { softPromo: !previewCode },
    );
    return {
      ...cart,
      promoCode: toPublicPromo(cart.promoCode),
      ...totals,
    };
  }

  async getCart(userId: string) {
    const cart = await this.requireCart(userId);
    return this.buildCartView(userId, cart);
  }

  /// Блокировка строки корзины до конца транзакции: сериализует параллельные
  /// add/patch одной корзины (уникального индекса на строки нет — миграций не
  /// делаем, ревью Q28).
  private async lockCart(tx: Prisma.TransactionClient, cartId: string) {
    await tx.$queryRaw`SELECT id FROM carts WHERE id = ${cartId} FOR UPDATE`;
  }

  /// Получатель подарка. Один и тот же ответ (404 CART_GIFT_UNAVAILABLE) для
  /// «нет такого игрока» и «подарить ему нельзя» (самому себе) — это лишь
  /// убирает различие между этими двумя отказами. Перебор ников НЕ исключён:
  /// успех (201) для существующего игрока отличим от 404, поэтому защита —
  /// строгий лимит операций с подарком (CartGiftRateGuard: 10/мин и 60/час на
  /// пользователя, мягче на IP; допущение владельца Q81). Отказ по самому
  /// товару (не подарочный) от получателя не зависит и проверяется до поиска.
  private async resolveGiftTarget(
    senderId: string,
    username: string | undefined | null,
    product: { isGiftable: boolean; isSelfOnly: boolean } | null,
  ) {
    if (!username) {
      return null;
    }
    if (product && (product.isSelfOnly || !product.isGiftable)) {
      throw badRequest(
        StoreCartError.CART_GIFT_NOT_ALLOWED,
        product.isSelfOnly
          ? 'Этот товар нельзя подарить — только для себя'
          : 'Этот товар нельзя подарить',
      );
    }
    // Без ILIKE: Prisma insensitive = ILIKE, где `_` — подстановка (a_b нашёл бы
    // aXb). Сравнение lower() = lower($1) с параметром, точное совпадение
    // регистра — первым (username unique различает регистр).
    const [target] = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM users
      WHERE lower(username) = lower(${username})
      ORDER BY (username = ${username}) DESC, id
      LIMIT 1`;
    if (!target || target.id === senderId) {
      throw notFound(
        StoreCartError.CART_GIFT_UNAVAILABLE,
        'Подарок этому получателю оформить нельзя',
      );
    }
    return target.id;
  }

  async addItem(userId: string, dto: AddCartItemDto) {
    if (!dto.variantId && !dto.bundleId) {
      throw badRequest(
        StoreCartError.CART_TARGET_REQUIRED,
        'Нужно указать variantId или bundleId',
      );
    }
    if (dto.variantId && dto.bundleId) {
      throw badRequest(
        StoreCartError.CART_TARGET_AMBIGUOUS,
        'Нельзя указать одновременно variantId и bundleId',
      );
    }
    const cart = await this.requireCart(userId);
    const quantity = dto.quantity ?? 1;

    let target: LineKey & {
      productId: string | null;
      limit: Omit<CartLimitLine, 'quantity'>;
    };
    if (dto.variantId) {
      const variant = await this.prisma.productVariant.findUnique({
        where: { id: dto.variantId },
        include: { product: true },
      });
      if (!variant || !variant.isActive || !variant.product.isActive) {
        throw notFound(
          StoreCartError.VARIANT_NOT_FOUND,
          'Вариант товара не найден',
        );
      }
      const giftToUserId = await this.resolveGiftTarget(
        userId,
        dto.giftToUsername,
        variant.product,
      );
      target = {
        variantId: variant.id,
        bundleId: null,
        giftToUserId,
        productId: variant.productId,
        limit: {
          productId: variant.productId,
          productName: variant.product.name,
          isUnique: variant.product.isUnique,
          maxPerPurchase: variant.product.maxPerPurchase,
        },
      };
    } else {
      const bundle = await this.prisma.bundle.findUnique({
        where: { id: dto.bundleId },
      });
      if (!bundle || !bundle.isActive) {
        throw notFound(StoreCartError.BUNDLE_NOT_FOUND, 'Набор не найден');
      }
      target = {
        variantId: null,
        bundleId: bundle.id,
        giftToUserId: null,
        productId: null,
        limit: {
          productId: null,
          productName: bundle.name,
          isUnique: false,
          maxPerPurchase: null,
        },
      };
    }

    await this.prisma.$transaction(async (tx) => {
      await this.lockCart(tx, cart.id);
      const items = await tx.cartItem.findMany({
        where: { cartId: cart.id },
        include: LOCKED_ITEM_INCLUDE,
      });
      const existing = items.find((i) => sameLine(i, target));
      const projected = items.map((i) =>
        i.id === existing?.id
          ? { ...limitLine(i), quantity: i.quantity + quantity }
          : limitLine(i),
      );
      if (!existing) {
        projected.push({ ...target.limit, quantity });
      }
      assertCartLimits(projected, target.productId);

      if (existing) {
        // Тот же вариант (и получатель) — одна строка, количество суммируется.
        await tx.cartItem.update({
          where: { id: existing.id },
          data: {
            quantity: { increment: quantity },
            ...(dto.giftMessage !== undefined
              ? { giftMessage: dto.giftMessage }
              : {}),
          },
        });
      } else {
        await tx.cartItem.create({
          data: {
            cartId: cart.id,
            productId: target.productId,
            variantId: target.variantId,
            bundleId: target.bundleId,
            quantity,
            giftToUserId: target.giftToUserId,
            giftMessage: dto.giftMessage,
          },
        });
      }
    });

    return this.getCart(userId);
  }

  private async requireOwnItem(userId: string, itemId: string) {
    const item = await this.prisma.cartItem.findUnique({
      where: { id: itemId },
      include: { cart: true },
    });
    if (!item || item.cart.userId !== userId) {
      throw notFound(
        StoreCartError.CART_ITEM_NOT_FOUND,
        'Позиция корзины не найдена',
      );
    }
    return item;
  }

  async updateItem(userId: string, itemId: string, dto: UpdateCartItemDto) {
    const item = await this.requireOwnItem(userId, itemId);
    let giftToUserId = item.giftToUserId;
    if (dto.giftToUsername !== undefined) {
      const product = item.productId
        ? await this.prisma.product.findUnique({
            where: { id: item.productId },
          })
        : null;
      giftToUserId = await this.resolveGiftTarget(
        userId,
        dto.giftToUsername,
        product,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await this.lockCart(tx, item.cartId);
      const items = await tx.cartItem.findMany({
        where: { cartId: item.cartId },
        include: LOCKED_ITEM_INCLUDE,
      });
      const current = items.find((i) => i.id === itemId);
      if (!current) {
        throw notFound(
          StoreCartError.CART_ITEM_NOT_FOUND,
          'Позиция корзины не найдена',
        );
      }
      const quantity = dto.quantity ?? current.quantity;
      // Смена получателя могла сделать строку такой же, как другая — сливаем.
      const twin = items.find(
        (i) => i.id !== itemId && sameLine(i, { ...current, giftToUserId }),
      );

      const projected = items
        .filter((i) => i.id !== itemId && i.id !== twin?.id)
        .map(limitLine);
      if (twin) {
        projected.push({
          ...limitLine(twin),
          quantity: twin.quantity + quantity,
        });
      } else {
        projected.push({ ...limitLine(current), quantity });
      }
      assertCartLimits(projected, current.productId);

      const message =
        dto.giftMessage !== undefined ? { giftMessage: dto.giftMessage } : {};
      if (twin) {
        await tx.cartItem.update({
          where: { id: twin.id },
          data: { quantity: { increment: quantity }, ...message },
        });
        await tx.cartItem.delete({ where: { id: itemId } });
      } else {
        await tx.cartItem.update({
          where: { id: itemId },
          data: {
            quantity,
            ...(dto.giftToUsername !== undefined ? { giftToUserId } : {}),
            ...message,
          },
        });
      }
    });
    return this.getCart(userId);
  }

  async removeItem(userId: string, itemId: string) {
    await this.requireOwnItem(userId, itemId);
    await this.prisma.cartItem.delete({ where: { id: itemId } });
    return this.getCart(userId);
  }

  async clear(userId: string) {
    const cart = await this.requireCart(userId);
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    return this.getCart(userId);
  }

  async applyPromo(userId: string, code: string) {
    const cart = await this.requireCart(userId);
    if (cart.items.length === 0) {
      throw badRequest(StoreCartError.CART_EMPTY, 'Корзина пуста');
    }
    const { lines } = await this.pricing.priceLines(cart.items);
    const productTypes = lines
      .map((l) => l.productType)
      .filter((t): t is NonNullable<typeof t> => t !== null);
    const subtotalAfterBulk = lines.reduce(
      (sum, l) => sum.plus(l.lineTotal),
      new Prisma.Decimal(0),
    );
    // Та же база, что в computeTotals (после скидки лояльности): иначе
    // промокод применился бы, а при расчёте тут же получил PROMO_MIN_AMOUNT.
    const loyaltyPercent = await this.pricing.getLoyaltyDiscountPercent(userId);
    const afterLoyalty = subtotalAfterBulk.minus(
      subtotalAfterBulk.times(loyaltyPercent).dividedBy(100),
    );
    const promo = await this.pricing.requireValidPromoCode(code, userId, {
      subtotalAfterBulk: afterLoyalty,
      productTypes,
    });
    await this.prisma.cart.update({
      where: { id: cart.id },
      data: { promoCodeId: promo.id },
    });
    return this.getCart(userId);
  }

  async removePromo(userId: string) {
    const cart = await this.requireCart(userId);
    await this.prisma.cart.update({
      where: { id: cart.id },
      data: { promoCodeId: null },
    });
    return this.getCart(userId);
  }

  /// Превью с явным кодом — отказ промокода это 4xx с кодом PROMO_*; без кода
  /// считается сохранённый (мягко, как в GET /store/cart).
  async calculate(userId: string, dto: CalculateCartDto) {
    const cart = await this.requireCart(userId);
    return this.buildCartView(userId, cart, dto.promoCode);
  }

  async validatePromo(userId: string | null, code: string) {
    try {
      const promo = await this.pricing.requireValidPromoCode(code, userId, {});
      return {
        valid: true,
        discountType: promo.discountType,
        discountValue: promo.discountValue,
      };
    } catch (error) {
      const known = toPromoError(error);
      return {
        valid: false,
        reason: (error as Error).message,
        ...(known ? { code: known.code } : {}),
      };
    }
  }
}
