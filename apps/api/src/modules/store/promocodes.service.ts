import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PromoCode } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePromoCodeDto } from './dto/create-promo-code.dto';
import { UpdatePromoCodeDto } from './dto/update-promo-code.dto';
import {
  assertDiscountValue,
  FULL_DISCOUNT_NOTE,
  isFullPercentDiscount,
  money,
} from './discount-validation';

/// Поля промокода для аудита: деньги — нормализованными строками, без
/// служебных счётчиков использования.
function promoSnapshot(promo: PromoCode): Prisma.InputJsonObject {
  return {
    code: promo.code,
    discountType: promo.discountType,
    discountValue: money(promo.discountValue),
    maxUses: promo.maxUses,
    validFrom: promo.validFrom?.toISOString() ?? null,
    validUntil: promo.validUntil?.toISOString() ?? null,
    isActive: promo.isActive,
    applicableToTypes: promo.applicableToTypes,
    minOrderAmount: money(promo.minOrderAmount),
    firstPurchaseOnly: promo.firstPurchaseOnly,
  };
}

@Injectable()
export class PromocodesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /// Денежные настройки меняют цену заказов — запись аудита идёт в той же
  /// транзакции и в строгом режиме: нет записи — нет изменения.
  private auditEvent(
    tx: Prisma.TransactionClient,
    actorId: string,
    action: string,
    targetId: string,
    changes: Prisma.InputJsonValue,
    severity: 'info' | 'warning' = 'warning',
  ) {
    return this.audit.log({
      actorId,
      action,
      targetType: 'store.promocode',
      targetId,
      changes,
      severity,
      tx,
      strict: true,
    });
  }

  /// Q83: отдельное предупреждающее событие для промокода на 100%. Код
  /// промокода — не секрет (вводится покупателем), но в аудит идёт только id и
  /// нормализованное значение.
  private auditFullPercent(
    tx: Prisma.TransactionClient,
    actorId: string,
    targetId: string,
    code: string,
  ) {
    return this.auditEvent(
      tx,
      actorId,
      'store.promocode.full_percent',
      targetId,
      {
        note: FULL_DISCOUNT_NOTE,
        code,
        discountType: 'PERCENT',
        discountValue: '100.00',
      },
    );
  }

  async list(search?: string) {
    const term = search?.trim().slice(0, 64);
    const where: Prisma.PromoCodeWhereInput = term
      ? { code: { contains: term, mode: 'insensitive' } }
      : {};
    return this.prisma.promoCode.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  private assertDates(
    validFrom: Date | null | undefined,
    validUntil: Date | null | undefined,
  ) {
    if (validFrom && validUntil && validUntil <= validFrom) {
      throw new BadRequestException({
        code: 'PROMO_DATES_INVALID',
        message: 'validUntil должен быть позже validFrom',
      });
    }
  }

  async create(dto: CreatePromoCodeDto, actorId: string) {
    const code = dto.code.toUpperCase();
    assertDiscountValue(dto.discountType, dto.discountValue, 'discountValue');
    const validFrom = dto.validFrom ? new Date(dto.validFrom) : undefined;
    const validUntil = dto.validUntil ? new Date(dto.validUntil) : undefined;
    this.assertDates(validFrom, validUntil);
    const existing = await this.prisma.promoCode.findUnique({
      where: { code },
    });
    if (existing) {
      throw new ConflictException('Такой промокод уже существует');
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.promoCode.create({
          data: {
            ...dto,
            code,
            validFrom,
            validUntil,
          },
        });
        await this.auditEvent(
          tx,
          actorId,
          'store.promocode.created',
          created.id,
          promoSnapshot(created),
          'info',
        );
        if (
          isFullPercentDiscount(created.discountType, created.discountValue)
        ) {
          await this.auditFullPercent(tx, actorId, created.id, created.code);
        }
        return created;
      });
    } catch (error) {
      // Гонка двух одновременных создателей: уникальный индекс по code.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Такой промокод уже существует');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdatePromoCodeDto, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM promo_codes WHERE id = ${id} FOR UPDATE`;
      const before = await tx.promoCode.findUnique({ where: { id } });
      if (!before) {
        throw new NotFoundException('Промокод не найден');
      }
      const { validFrom, validUntil, ...rest } = dto;
      if (dto.discountType !== undefined || dto.discountValue !== undefined) {
        assertDiscountValue(
          dto.discountType ?? before.discountType,
          dto.discountValue ?? before.discountValue,
          'discountValue',
        );
      }
      const nextFrom = validFrom ? new Date(validFrom) : before.validFrom;
      const nextUntil = validUntil ? new Date(validUntil) : before.validUntil;
      this.assertDates(nextFrom, nextUntil);
      if (dto.maxUses !== undefined && dto.maxUses < before.usedCount) {
        throw new BadRequestException({
          code: 'PROMO_MAX_USES_BELOW_USED',
          message: `maxUses не может быть меньше уже использованного числа раз (${before.usedCount})`,
        });
      }
      const updated = await tx.promoCode.update({
        where: { id },
        data: {
          ...rest,
          ...(validFrom ? { validFrom: new Date(validFrom) } : {}),
          ...(validUntil ? { validUntil: new Date(validUntil) } : {}),
        },
      });
      const was = promoSnapshot(before);
      const now = promoSnapshot(updated);
      const changed = Object.keys(now).filter(
        (key) => JSON.stringify(was[key]) !== JSON.stringify(now[key]),
      );
      if (changed.length > 0) {
        await this.auditEvent(
          tx,
          actorId,
          'store.promocode.updated',
          id,
          {
            code: before.code,
            from: Object.fromEntries(changed.map((k) => [k, was[k]])),
            to: Object.fromEntries(changed.map((k) => [k, now[k]])),
          },
          'warning',
        );
        if (
          isFullPercentDiscount(updated.discountType, updated.discountValue)
        ) {
          await this.auditFullPercent(tx, actorId, id, before.code);
        }
      }
      return updated;
    });
  }

  /// Промокод, по которому есть заказы, не удаляется (история покупок и FK
  /// заказа): 409 с подсказкой деактивировать. Без заказов: корзины с этим
  /// кодом очищаются, записи использований удаляются каскадом.
  async remove(id: string, actorId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Блокировка строки: вставка заказа с FK на промокод берёт FOR KEY SHARE
      // и дождётся конца транзакции.
      await tx.$queryRaw`SELECT id FROM promo_codes WHERE id = ${id} FOR UPDATE`;
      const promo = await tx.promoCode.findUnique({ where: { id } });
      if (!promo) {
        throw new NotFoundException('Промокод не найден');
      }
      const orders = await tx.order.count({ where: { promoCodeId: id } });
      if (orders > 0) {
        throw new ConflictException({
          code: 'PROMO_HAS_ORDERS',
          message:
            'По промокоду есть заказы — удалить нельзя, отключите его (isActive: false)',
        });
      }
      const carts = await tx.cart.updateMany({
        where: { promoCodeId: id },
        data: { promoCodeId: null },
      });
      await tx.promoCode.delete({ where: { id } });
      await this.auditEvent(
        tx,
        actorId,
        'store.promocode.deleted',
        id,
        { ...promoSnapshot(promo), clearedCarts: carts.count },
        'warning',
      );
    });
  }
}
