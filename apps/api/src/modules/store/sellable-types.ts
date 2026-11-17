import { ProductType } from '@prisma/client';

/// Закрытый список продаваемых типов (ADR-0185 п. 2): товар типа вне списка
/// нельзя активировать.
/// TODO(0.11): значение по умолчанию ниже должно читаться из настройки
/// `store.sellableTypes` (изменение — только владелец, аудит critical).
/// Пока настройки нет — константа по ADR-0185; BUNDLE в список не входит
/// (наборы продаются отдельной сущностью Bundle).
export const DEFAULT_SELLABLE_TYPES: readonly ProductType[] = [
  ProductType.PRIVILEGE,
  ProductType.KEY,
  ProductType.UNMUTE,
  ProductType.UNBAN,
  ProductType.CURRENCY,
  ProductType.BATTLE_PASS,
];

export function isSellableType(
  type: ProductType,
  allowed: readonly ProductType[] = DEFAULT_SELLABLE_TYPES,
): boolean {
  return allowed.includes(type);
}
