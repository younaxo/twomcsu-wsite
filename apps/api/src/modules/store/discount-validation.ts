import { BadRequestException } from '@nestjs/common';
import { DiscountType, Prisma } from '@prisma/client';

/// Размер скидки (0.4): PERCENT — строго больше 0 и не больше 100; FIXED и
/// BONUS — строго больше 0. Расчёт цены (PricingService) не меняется: здесь
/// только входная валидация админки.
export function assertDiscountValue(
  type: DiscountType,
  value: string | Prisma.Decimal,
  field: string,
): void {
  const decimal = new Prisma.Decimal(value);
  if (!decimal.greaterThan(0)) {
    throw new BadRequestException({
      code: 'DISCOUNT_VALUE_INVALID',
      message: `${field}: размер скидки должен быть больше 0`,
    });
  }
  if (type === DiscountType.PERCENT && decimal.greaterThan(100)) {
    throw new BadRequestException({
      code: 'DISCOUNT_VALUE_INVALID',
      message: `${field}: процент скидки не может превышать 100`,
    });
  }
}

/// Нормализованная строка Decimal для аудита и сравнения ("10" и "10.00" —
/// одно и то же значение).
export function money(
  value: Prisma.Decimal | string | null | undefined,
): string | null {
  return value === null || value === undefined
    ? null
    : new Prisma.Decimal(value).toFixed(2);
}
