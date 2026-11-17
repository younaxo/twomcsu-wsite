import { Matches } from 'class-validator';

/// Цена в DTO — строка-Decimal (до 8 цифр до точки и до 2 после, как
/// Decimal(10,2) в схеме). Число (float) не принимается: 0.1 + 0.2 в деньгах
/// недопустимо. Prisma принимает строку для Decimal без потери точности.
export const PRICE_STRING = /^\d{1,8}(\.\d{1,2})?$/;
export const PRICE_STRING_MESSAGE =
  'Цена — строка с десятичным числом не более 2 знаков после точки, например "199.00"';

export function IsPriceString(): PropertyDecorator {
  return Matches(PRICE_STRING, { message: PRICE_STRING_MESSAGE });
}
