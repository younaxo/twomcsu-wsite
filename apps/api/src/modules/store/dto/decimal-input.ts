import { Transform } from 'class-transformer';
import { Matches } from 'class-validator';
import { PRICE_STRING } from './price-string';

export const DECIMAL_INPUT_MESSAGE =
  'Значение — десятичное число не более 2 знаков после точки, например "10.50" (отрицательные и экспоненциальная запись не допускаются)';

/// Денежная сумма или процент в DTO скидок/промокодов (0.4): строка-Decimal.
/// Для обратной совместимости конечное число (JSON number) приводится к строке
/// ДО валидации, после чего проверяется тем же шаблоном, что и цены (до 2
/// знаков после точки; "1e-7", NaN и отрицательные значения — 400). В Prisma
/// уходит строка, поэтому двоичных float-ошибок в БД нет.
export function IsDecimalInput(): PropertyDecorator {
  const normalize = Transform(({ value }: { value: unknown }) =>
    typeof value === 'number' && Number.isFinite(value) ? String(value) : value,
  );
  const matches = Matches(PRICE_STRING, { message: DECIMAL_INPUT_MESSAGE });
  return (target, key) => {
    normalize(target, key);
    matches(target, key);
  };
}
