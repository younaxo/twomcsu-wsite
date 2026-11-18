import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { isSellableType } from './sellable-types';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { ListAdminProductsQueryDto } from './dto/list-admin-products-query.dto';
import { ListProductsQueryDto } from './dto/list-products-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { PUBLIC_PRODUCT_SELECT } from './public-product';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /// Явные события каталога поверх общего AuditInterceptor: он пишет только
  /// тело запроса, а для денег нужно «было → стало». Без секретов: только
  /// цены, флаги и идентификаторы.
  /// Для изменений цены/активности/удаления запись идёт в ТОЙ ЖЕ транзакции
  /// (tx) и в строгом режиме: сбой записи аудита откатывает изменение, а не
  /// теряется молча (AuditService.log иначе глотает ошибки при severity < critical).
  private async auditEvent(
    actorId: string,
    action: string,
    targetId: string,
    changes: Prisma.InputJsonValue,
    severity: 'info' | 'warning' = 'warning',
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await this.audit.log({
      actorId,
      action,
      targetType: 'store.product',
      targetId,
      changes,
      severity,
      tx,
      strict: tx !== undefined,
    });
  }

  /// Нормализованная строка Decimal для сравнения и аудита ("100" и "100.00"
  /// — одна и та же цена).
  private money(value: Prisma.Decimal | string | null | undefined) {
    return value === null || value === undefined
      ? null
      : new Prisma.Decimal(value).toFixed(2);
  }

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
        select: PUBLIC_PRODUCT_SELECT,
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
      select: { ...PUBLIC_PRODUCT_SELECT, isActive: true },
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
    const { isActive: _isActive, ...publicProduct } = product;
    return { ...publicProduct, inWishlist };
  }

  /// Реальная аналитика по совместным покупкам — агрегация OrderItem по
  /// завершённым заказам, где встречается данный товар; не моковые данные.
  async getBoughtTogether(slug: string): Promise<unknown[]> {
    const product = await this.prisma.product.findUnique({
      where: { slug },
      select: { id: true, isActive: true },
    });
    if (!product || !product.isActive) {
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
      select: PUBLIC_PRODUCT_SELECT,
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

  async create(dto: CreateProductDto, actorId: string) {
    const existing = await this.prisma.product.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException('Товар с таким slug уже существует');
    }
    await this.requireCategory(dto.categoryId);
    const { variants, ...rest } = dto;
    const created = await this.prisma.product.create({
      data: {
        ...rest,
        // ADR-0185 п. 6: новый товар неактивен, включает админ отдельным шагом.
        isActive: false,
        variants: { create: variants },
      },
      include: { category: true, variants: true },
    });
    await this.auditEvent(
      actorId,
      'store.product.created',
      created.id,
      {
        slug: created.slug,
        type: created.type,
        isActive: false,
        variants: created.variants.map((v) => ({
          duration: v.duration,
          price: this.money(v.price),
          oldPrice: this.money(v.oldPrice),
        })),
      },
      'info',
    );
    return created;
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

  async update(id: string, dto: UpdateProductDto, actorId: string) {
    const before = await this.getAdminById(id);
    if (dto.categoryId) {
      await this.requireCategory(dto.categoryId);
    }
    // ADR-0185 п. 2: активировать можно только товар типа из закрытого списка.
    if (dto.isActive === true && !isSellableType(before.type)) {
      throw new UnprocessableEntityException({
        code: 'PRODUCT_TYPE_NOT_SELLABLE',
        message: `Товар типа ${before.type} нельзя активировать: тип не входит в список продаваемых`,
      });
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id },
        data: dto,
        include: { category: true, variants: true },
      });
      if (dto.isActive !== undefined && dto.isActive !== before.isActive) {
        await this.auditEvent(
          actorId,
          'store.product.activation_changed',
          id,
          { from: before.isActive, to: dto.isActive },
          'warning',
          tx,
        );
      }
      return updated;
    });
  }

  /// Мягкое удаление, если товар есть в заказах (история покупок не должна
  /// терять товар: FK OrderItem.productId — SET NULL); жёсткое — только без
  /// заказов. Набор с этим товаром блокирует удаление (409). Корзины и
  /// списки желаний очищаются от товара в той же транзакции.
  async remove(
    id: string,
    actorId: string,
  ): Promise<{ mode: 'deleted' | 'deactivated' }> {
    const product = await this.getAdminById(id);
    // Проверки и удаление — в одной транзакции. Блокировка строки товара
    // (FOR UPDATE) конфликтует с FOR KEY SHARE, который берёт вставка
    // OrderItem по FK: параллельный заказ дождётся конца транзакции и не
    // сможет «обнулить» productId через ON DELETE SET NULL.
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM products WHERE id = ${id} FOR UPDATE`;
      const orderItems = await tx.orderItem.count({
        where: { productId: id },
      });
      if (orderItems > 0) {
        await tx.product.update({ where: { id }, data: { isActive: false } });
        await this.auditEvent(
          actorId,
          'store.product.deactivated_instead_of_delete',
          id,
          {
            reason: 'has_orders',
            orderItems,
            wasActive: product.isActive,
          },
          'warning',
          tx,
        );
        return { mode: 'deactivated' as const };
      }
      const bundleItems = await tx.bundleItem.count({
        where: { productId: id },
      });
      if (bundleItems > 0) {
        throw new ConflictException({
          code: 'PRODUCT_IN_BUNDLE',
          message:
            'Товар входит в набор: уберите его из наборов или деактивируйте товар',
        });
      }
      await tx.cartItem.deleteMany({ where: { productId: id } });
      await tx.wishlistItem.deleteMany({ where: { productId: id } });
      await tx.product.delete({ where: { id } });
      await this.auditEvent(
        actorId,
        'store.product.deleted',
        id,
        { slug: product.slug, type: product.type },
        'warning',
        tx,
      );
      return { mode: 'deleted' as const };
    });
    return result;
  }

  async createVariant(
    productId: string,
    dto: CreateVariantDto,
    actorId: string,
  ) {
    await this.getAdminById(productId);
    const existing = await this.prisma.productVariant.findUnique({
      where: { productId_duration: { productId, duration: dto.duration } },
    });
    if (existing) {
      throw new ConflictException(
        'Вариант с такой длительностью уже существует',
      );
    }
    const created = await this.prisma.productVariant.create({
      data: { productId, ...dto },
    });
    await this.auditEvent(actorId, 'store.product.variant_created', productId, {
      variantId: created.id,
      duration: created.duration,
      price: this.money(created.price),
      oldPrice: this.money(created.oldPrice),
    });
    return created;
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
    actorId: string,
  ) {
    const before = await this.requireVariant(productId, variantId);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.productVariant.update({
        where: { id: variantId },
        data: dto,
      });
      const priceBefore = this.money(before.price);
      const priceAfter = this.money(updated.price);
      const oldBefore = this.money(before.oldPrice);
      const oldAfter = this.money(updated.oldPrice);
      if (priceBefore !== priceAfter || oldBefore !== oldAfter) {
        await this.auditEvent(
          actorId,
          'store.product.variant_price_changed',
          productId,
          {
            variantId,
            duration: before.duration,
            price: { from: priceBefore, to: priceAfter },
            oldPrice: { from: oldBefore, to: oldAfter },
          },
          'warning',
          tx,
        );
      }
      if (before.isActive !== updated.isActive) {
        await this.auditEvent(
          actorId,
          'store.product.variant_activation_changed',
          productId,
          {
            variantId,
            duration: before.duration,
            from: before.isActive,
            to: updated.isActive,
          },
          'warning',
          tx,
        );
      }
      return updated;
    });
  }

  /// Вариант с заказами не удаляется (история) — деактивируется; без заказов
  /// удаляется вместе со строками корзин на него.
  async removeVariant(
    productId: string,
    variantId: string,
    actorId: string,
  ): Promise<{ mode: 'deleted' | 'deactivated' }> {
    const variant = await this.requireVariant(productId, variantId);
    // См. remove: блокировка строки варианта + проверки и удаление в одной
    // транзакции. У BundleItem.variantId нет FK, поэтому набор проверяем явно.
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM product_variants WHERE id = ${variantId} FOR UPDATE`;
      const orderItems = await tx.orderItem.count({ where: { variantId } });
      if (orderItems > 0) {
        await tx.productVariant.update({
          where: { id: variantId },
          data: { isActive: false },
        });
        await this.auditEvent(
          actorId,
          'store.product.variant_deactivated_instead_of_delete',
          productId,
          { variantId, duration: variant.duration, orderItems },
          'warning',
          tx,
        );
        return { mode: 'deactivated' as const };
      }
      const bundleItems = await tx.bundleItem.count({ where: { variantId } });
      if (bundleItems > 0) {
        throw new ConflictException({
          code: 'VARIANT_IN_BUNDLE',
          message:
            'Вариант входит в набор: уберите его из наборов или деактивируйте вариант',
        });
      }
      await tx.cartItem.deleteMany({ where: { variantId } });
      await tx.productVariant.delete({ where: { id: variantId } });
      await this.auditEvent(
        actorId,
        'store.product.variant_deleted',
        productId,
        {
          variantId,
          duration: variant.duration,
          price: this.money(variant.price),
        },
        'warning',
        tx,
      );
      return { mode: 'deleted' as const };
    });
    return result;
  }
}
