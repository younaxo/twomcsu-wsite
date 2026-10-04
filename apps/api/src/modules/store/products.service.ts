import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { ListAdminProductsQueryDto } from './dto/list-admin-products-query.dto';
import { ListProductsQueryDto } from './dto/list-products-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';

const PUBLIC_INCLUDE = {
  category: true,
  variants: { where: { isActive: true }, orderBy: { price: 'asc' } },
} satisfies Prisma.ProductInclude;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListProductsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 30;
    const where: Prisma.ProductWhereInput = {
      isActive: true,
      ...(query.categorySlug ? { category: { slug: query.categorySlug } } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: PUBLIC_INCLUDE,
        orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.product.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async listAdmin(query: ListAdminProductsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 30;
    const where: Prisma.ProductWhereInput = query.search
      ? { name: { contains: query.search, mode: 'insensitive' } }
      : {};
    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: { category: true, variants: { orderBy: { price: 'asc' } } },
        orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.product.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async getBySlug(slug: string, viewerId: string | null) {
    const product = await this.prisma.product.findUnique({
      where: { slug },
      include: PUBLIC_INCLUDE,
    });
    if (!product || !product.isActive) {
      throw new NotFoundException('Товар не найден');
    }
    let inWishlist = false;
    if (viewerId) {
      const item = await this.prisma.wishlistItem.findFirst({
        where: { productId: product.id, wishlist: { userId: viewerId } },
      });
      inWishlist = item !== null;
    }
    return { ...product, inWishlist };
  }

  /// Реальная аналитика по совместным покупкам — агрегация OrderItem по
  /// завершённым заказам, где встречается данный товар; не моковые данные.
  async getBoughtTogether(slug: string): Promise<unknown[]> {
    const product = await this.prisma.product.findUnique({ where: { slug } });
    if (!product) {
      throw new NotFoundException('Товар не найден');
    }
    const coOrderItems = await this.prisma.orderItem.findMany({
      where: {
        order: {
          status: OrderStatus.COMPLETED,
          items: { some: { productId: product.id } },
        },
        productId: { not: product.id },
      },
      select: { productId: true },
    });
    const counts = new Map<string, number>();
    for (const item of coOrderItems) {
      if (!item.productId) continue;
      counts.set(item.productId, (counts.get(item.productId) ?? 0) + 1);
    }
    const topIds = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => id);
    if (topIds.length === 0) {
      return [];
    }
    const products = await this.prisma.product.findMany({
      where: { id: { in: topIds }, isActive: true },
      include: PUBLIC_INCLUDE,
    });
    const order = new Map(topIds.map((id, index) => [id, index]));
    return products.sort(
      (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
    );
  }

  private async requireCategory(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) {
      throw new NotFoundException('Категория не найдена');
    }
  }

  async create(dto: CreateProductDto) {
    const existing = await this.prisma.product.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException('Товар с таким slug уже существует');
    }
    await this.requireCategory(dto.categoryId);
    const { variants, ...rest } = dto;
    return this.prisma.product.create({
      data: {
        ...rest,
        variants: { create: variants },
      },
      include: { category: true, variants: true },
    });
  }

  async getAdminById(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { category: true, variants: { orderBy: { price: 'asc' } } },
    });
    if (!product) {
      throw new NotFoundException('Товар не найден');
    }
    return product;
  }

  async update(id: string, dto: UpdateProductDto) {
    await this.getAdminById(id);
    if (dto.categoryId) {
      await this.requireCategory(dto.categoryId);
    }
    return this.prisma.product.update({
      where: { id },
      data: dto,
      include: { category: true, variants: true },
    });
  }

  async remove(id: string): Promise<void> {
    await this.getAdminById(id);
    await this.prisma.product.delete({ where: { id } });
  }

  async createVariant(productId: string, dto: CreateVariantDto) {
    await this.getAdminById(productId);
    const existing = await this.prisma.productVariant.findUnique({
      where: { productId_duration: { productId, duration: dto.duration } },
    });
    if (existing) {
      throw new ConflictException(
        'Вариант с такой длительностью уже существует',
      );
    }
    return this.prisma.productVariant.create({ data: { productId, ...dto } });
  }

  private async requireVariant(productId: string, variantId: string) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
    });
    if (!variant || variant.productId !== productId) {
      throw new NotFoundException('Вариант не найден');
    }
    return variant;
  }

  async updateVariant(
    productId: string,
    variantId: string,
    dto: UpdateVariantDto,
  ) {
    await this.requireVariant(productId, variantId);
    return this.prisma.productVariant.update({
      where: { id: variantId },
      data: dto,
    });
  }

  async removeVariant(productId: string, variantId: string): Promise<void> {
    await this.requireVariant(productId, variantId);
    await this.prisma.productVariant.delete({ where: { id: variantId } });
  }
}
