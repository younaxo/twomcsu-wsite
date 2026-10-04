import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CartService } from './cart.service';
import { GiftWishlistItemDto } from './dto/gift-wishlist-item.dto';

const WISHLIST_INCLUDE = {
  items: {
    include: {
      product: { include: { variants: { where: { isActive: true } } } },
    },
  },
} as const;

@Injectable()
export class WishlistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cart: CartService,
  ) {}

  private async requireWishlist(userId: string) {
    return this.prisma.wishlist.upsert({
      where: { userId },
      create: { userId },
      update: {},
      include: WISHLIST_INCLUDE,
    });
  }

  async getWishlist(userId: string) {
    return this.requireWishlist(userId);
  }

  async addItem(userId: string, productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product || !product.isActive) {
      throw new NotFoundException('Товар не найден');
    }
    const wishlist = await this.requireWishlist(userId);
    await this.prisma.wishlistItem.upsert({
      where: { wishlistId_productId: { wishlistId: wishlist.id, productId } },
      create: { wishlistId: wishlist.id, productId },
      update: {},
    });
    return this.getWishlist(userId);
  }

  async removeItem(userId: string, productId: string) {
    const wishlist = await this.requireWishlist(userId);
    await this.prisma.wishlistItem.deleteMany({
      where: { wishlistId: wishlist.id, productId },
    });
    return this.getWishlist(userId);
  }

  async updateVisibility(userId: string, isPublic: boolean) {
    const wishlist = await this.requireWishlist(userId);
    await this.prisma.wishlist.update({
      where: { id: wishlist.id },
      data: { isPublic },
    });
    return this.getWishlist(userId);
  }

  async getPublicByUsername(username: string) {
    const user = await this.prisma.user.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
    });
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }
    const wishlist = await this.prisma.wishlist.findUnique({
      where: { userId: user.id },
      include: WISHLIST_INCLUDE,
    });
    if (!wishlist || !wishlist.isPublic) {
      throw new NotFoundException('Список желаний не найден или скрыт');
    }
    return wishlist;
  }

  async giftItem(userId: string, productId: string, dto: GiftWishlistItemDto) {
    const wishlist = await this.requireWishlist(userId);
    const item = await this.prisma.wishlistItem.findUnique({
      where: { wishlistId_productId: { wishlistId: wishlist.id, productId } },
      include: {
        product: { include: { variants: { where: { isActive: true } } } },
      },
    });
    if (!item) {
      throw new NotFoundException('Товар не найден в вашем списке желаний');
    }
    const target = await this.prisma.user.findFirst({
      where: { username: { equals: dto.toUsername, mode: 'insensitive' } },
    });
    if (!target) {
      throw new NotFoundException('Получатель подарка не найден');
    }
    if (target.id === userId) {
      throw new BadRequestException('Нельзя подарить товар самому себе');
    }
    const variant = dto.variantId
      ? item.product.variants.find((v) => v.id === dto.variantId)
      : item.product.variants[0];
    if (!variant) {
      throw new NotFoundException('Вариант товара не найден');
    }
    return this.cart.addItem(userId, {
      variantId: variant.id,
      giftToUsername: dto.toUsername,
      giftMessage: dto.message,
    });
  }
}
