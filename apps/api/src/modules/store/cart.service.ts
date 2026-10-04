import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { CalculateCartDto } from './dto/calculate-cart.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from './pricing.service';

const CART_ITEM_INCLUDE = {
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
} as const;

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

  async getCart(userId: string) {
    const cart = await this.requireCart(userId);
    const totals = await this.pricing.computeTotals(
      cart.items,
      userId,
      cart.promoCode?.code ?? null,
    );
    return { ...cart, ...totals };
  }

  private async resolveGiftTarget(
    username: string | undefined,
    product: { isGiftable: boolean; isSelfOnly: boolean } | null,
  ) {
    if (!username) {
      return null;
    }
    if (product?.isSelfOnly) {
      throw new BadRequestException(
        'Этот товар нельзя подарить — только для себя',
      );
    }
    if (product && !product.isGiftable) {
      throw new BadRequestException('Этот товар нельзя подарить');
    }
    const target = await this.prisma.user.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
    });
    if (!target) {
      throw new NotFoundException('Получатель подарка не найден');
    }
    return target.id;
  }

  async addItem(userId: string, dto: AddCartItemDto) {
    if (!dto.variantId && !dto.bundleId) {
      throw new BadRequestException('Нужно указать variantId или bundleId');
    }
    if (dto.variantId && dto.bundleId) {
      throw new BadRequestException(
        'Нельзя указать одновременно variantId и bundleId',
      );
    }
    const cart = await this.requireCart(userId);
    const quantity = dto.quantity ?? 1;

    if (dto.variantId) {
      const variant = await this.prisma.productVariant.findUnique({
        where: { id: dto.variantId },
        include: { product: true },
      });
      if (!variant || !variant.isActive || !variant.product.isActive) {
        throw new NotFoundException('Вариант товара не найден');
      }
      if (
        variant.product.maxPerPurchase &&
        quantity > variant.product.maxPerPurchase
      ) {
        throw new BadRequestException(
          `Максимум ${variant.product.maxPerPurchase} шт. этого товара за покупку`,
        );
      }
      const giftToUserId = await this.resolveGiftTarget(
        dto.giftToUsername,
        variant.product,
      );
      await this.prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId: variant.productId,
          variantId: variant.id,
          quantity,
          giftToUserId,
          giftMessage: dto.giftMessage,
        },
      });
    } else {
      const bundle = await this.prisma.bundle.findUnique({
        where: { id: dto.bundleId },
      });
      if (!bundle || !bundle.isActive) {
        throw new NotFoundException('Набор не найден');
      }
      await this.prisma.cartItem.create({
        data: {
          cartId: cart.id,
          bundleId: bundle.id,
          quantity,
          giftMessage: dto.giftMessage,
        },
      });
    }

    return this.getCart(userId);
  }

  private async requireOwnItem(userId: string, itemId: string) {
    const item = await this.prisma.cartItem.findUnique({
      where: { id: itemId },
      include: { cart: true },
    });
    if (!item || item.cart.userId !== userId) {
      throw new NotFoundException('Позиция корзины не найдена');
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
      giftToUserId = await this.resolveGiftTarget(dto.giftToUsername, product);
    }
    await this.prisma.cartItem.update({
      where: { id: itemId },
      data: {
        ...(dto.quantity !== undefined ? { quantity: dto.quantity } : {}),
        ...(dto.giftToUsername !== undefined ? { giftToUserId } : {}),
        ...(dto.giftMessage !== undefined
          ? { giftMessage: dto.giftMessage }
          : {}),
      },
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
      throw new BadRequestException('Корзина пуста');
    }
    const { lines } = await this.pricing.priceLines(cart.items);
    const productTypes = lines
      .map((l) => l.productType)
      .filter((t): t is NonNullable<typeof t> => t !== null);
    const subtotalAfterBulk = lines.reduce(
      (sum, l) => sum.plus(l.lineTotal),
      new Prisma.Decimal(0),
    );
    const promo = await this.pricing.requireValidPromoCode(code, userId, {
      subtotalAfterBulk,
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

  async calculate(userId: string, dto: CalculateCartDto) {
    const cart = await this.requireCart(userId);
    const promoCode = dto.promoCode ?? cart.promoCode?.code ?? null;
    const totals = await this.pricing.computeTotals(
      cart.items,
      userId,
      promoCode,
    );
    return { ...cart, ...totals };
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
      return { valid: false, reason: (error as Error).message };
    }
  }
}
