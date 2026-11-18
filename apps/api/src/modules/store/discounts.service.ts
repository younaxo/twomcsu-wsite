import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BulkDiscount, LoyaltyDiscount, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertDiscountValue,
  FULL_DISCOUNT_NOTE,
  isFullPercentDiscount,
  money,
} from './discount-validation';
import { CreateBulkDiscountDto } from './dto/create-bulk-discount.dto';
import { CreateLoyaltyDiscountDto } from './dto/create-loyalty-discount.dto';
import { UpdateBulkDiscountDto } from './dto/update-bulk-discount.dto';
import { UpdateLoyaltyDiscountDto } from './dto/update-loyalty-discount.dto';

function bulkSnapshot(d: BulkDiscount): Prisma.InputJsonObject {
  return {
    productId: d.productId,
    productType: d.productType,
    minQuantity: d.minQuantity,
    minAmount: money(d.minAmount),
    discountType: d.discountType,
    discountValue: money(d.discountValue),
    isActive: d.isActive,
  };
}

function loyaltySnapshot(d: LoyaltyDiscount): Prisma.InputJsonObject {
  return {
    minPurchases: d.minPurchases,
    discountPercent: money(d.discountPercent),
    name: d.name,
    description: d.description,
    isActive: d.isActive,
  };
}

function diff(was: Prisma.InputJsonObject, now: Prisma.InputJsonObject) {
  const changed = Object.keys(now).filter(
    (key) => JSON.stringify(was[key]) !== JSON.stringify(now[key]),
  );
  return {
    changed,
    from: Object.fromEntries(changed.map((k) => [k, was[k]])),
    to: Object.fromEntries(changed.map((k) => [k, now[k]])),
  };
}

@Injectable()
export class DiscountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /// Скидки меняют цену заказов: запись аудита — в той же транзакции и в
  /// строгом режиме (нет записи — нет изменения).
  private auditEvent(
    tx: Prisma.TransactionClient,
    actorId: string,
    action: string,
    targetId: string,
    changes: Prisma.InputJsonValue,
  ) {
    return this.audit.log({
      actorId,
      action,
      targetType: 'store.discount',
      targetId,
      changes,
      severity: 'warning',
      tx,
      strict: true,
    });
  }

  /// Q83: отдельное предупреждающее событие для скидки 100% (без секретов).
  private auditFullPercent(
    tx: Prisma.TransactionClient,
    actorId: string,
    action: string,
    targetId: string,
    kind: 'bulk' | 'loyalty',
  ) {
    return this.auditEvent(tx, actorId, action, targetId, {
      note: FULL_DISCOUNT_NOTE,
      kind,
      discountType: 'PERCENT',
      discountValue: '100.00',
    });
  }

  /// Публичный список (только активные) — для витрины и расчёта цены.
  async listBulk() {
    return this.prisma.bulkDiscount.findMany({ where: { isActive: true } });
  }

  async listLoyalty() {
    return this.prisma.loyaltyDiscount.findMany({
      where: { isActive: true },
      orderBy: { minPurchases: 'asc' },
    });
  }

  /// Админский список: все скидки, включая неактивные.
  async listBulkAdmin() {
    return this.prisma.bulkDiscount.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async listLoyaltyAdmin() {
    return this.prisma.loyaltyDiscount.findMany({
      orderBy: { minPurchases: 'asc' },
    });
  }

  async createBulk(dto: CreateBulkDiscountDto, actorId: string) {
    assertDiscountValue(dto.discountType, dto.discountValue, 'discountValue');
    if (dto.productId) {
      const product = await this.prisma.product.findUnique({
        where: { id: dto.productId },
        select: { id: true },
      });
      if (!product) {
        throw new BadRequestException({
          code: 'PRODUCT_NOT_FOUND',
          message: 'Товар скидки не найден',
        });
      }
    }
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.bulkDiscount.create({ data: dto });
      await this.auditEvent(
        tx,
        actorId,
        'store.discount.bulk_created',
        created.id,
        bulkSnapshot(created),
      );
      if (isFullPercentDiscount(created.discountType, created.discountValue)) {
        await this.auditFullPercent(
          tx,
          actorId,
          'store.discount.full_percent',
          created.id,
          'bulk',
        );
      }
      return created;
    });
  }

  async updateBulk(id: string, dto: UpdateBulkDiscountDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM bulk_discounts WHERE id = ${id} FOR UPDATE`;
      const before = await tx.bulkDiscount.findUnique({ where: { id } });
      if (!before) {
        throw new NotFoundException('Скидка не найдена');
      }
      if (dto.discountType !== undefined || dto.discountValue !== undefined) {
        assertDiscountValue(
          dto.discountType ?? before.discountType,
          dto.discountValue ?? before.discountValue,
          'discountValue',
        );
      }
      const updated = await tx.bulkDiscount.update({
        where: { id },
        data: dto,
      });
      const { changed, from, to } = diff(
        bulkSnapshot(before),
        bulkSnapshot(updated),
      );
      if (changed.length > 0) {
        await this.auditEvent(tx, actorId, 'store.discount.bulk_updated', id, {
          from,
          to,
        });
        if (
          isFullPercentDiscount(updated.discountType, updated.discountValue)
        ) {
          await this.auditFullPercent(
            tx,
            actorId,
            'store.discount.full_percent',
            id,
            'bulk',
          );
        }
      }
      return updated;
    });
  }

  async removeBulk(id: string, actorId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.bulkDiscount.findUnique({ where: { id } });
      if (!before) {
        throw new NotFoundException('Скидка не найдена');
      }
      await tx.bulkDiscount.delete({ where: { id } });
      await this.auditEvent(
        tx,
        actorId,
        'store.discount.bulk_deleted',
        id,
        bulkSnapshot(before),
      );
    });
  }

  async createLoyalty(dto: CreateLoyaltyDiscountDto, actorId: string) {
    assertDiscountValue('PERCENT', dto.discountPercent, 'discountPercent');
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.loyaltyDiscount.create({ data: dto });
      await this.auditEvent(
        tx,
        actorId,
        'store.discount.loyalty_created',
        created.id,
        loyaltySnapshot(created),
      );
      if (isFullPercentDiscount('PERCENT', created.discountPercent)) {
        await this.auditFullPercent(
          tx,
          actorId,
          'store.discount.full_percent',
          created.id,
          'loyalty',
        );
      }
      return created;
    });
  }

  async updateLoyalty(
    id: string,
    dto: UpdateLoyaltyDiscountDto,
    actorId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM loyalty_discounts WHERE id = ${id} FOR UPDATE`;
      const before = await tx.loyaltyDiscount.findUnique({ where: { id } });
      if (!before) {
        throw new NotFoundException('Скидка за лояльность не найдена');
      }
      if (dto.discountPercent !== undefined) {
        assertDiscountValue('PERCENT', dto.discountPercent, 'discountPercent');
      }
      const updated = await tx.loyaltyDiscount.update({
        where: { id },
        data: dto,
      });
      const { changed, from, to } = diff(
        loyaltySnapshot(before),
        loyaltySnapshot(updated),
      );
      if (changed.length > 0) {
        await this.auditEvent(
          tx,
          actorId,
          'store.discount.loyalty_updated',
          id,
          { from, to },
        );
        if (isFullPercentDiscount('PERCENT', updated.discountPercent)) {
          await this.auditFullPercent(
            tx,
            actorId,
            'store.discount.full_percent',
            id,
            'loyalty',
          );
        }
      }
      return updated;
    });
  }

  async removeLoyalty(id: string, actorId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.loyaltyDiscount.findUnique({ where: { id } });
      if (!before) {
        throw new NotFoundException('Скидка за лояльность не найдена');
      }
      await tx.loyaltyDiscount.delete({ where: { id } });
      await this.auditEvent(
        tx,
        actorId,
        'store.discount.loyalty_deleted',
        id,
        loyaltySnapshot(before),
      );
    });
  }
}
