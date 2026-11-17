import { badRequest, conflict, StoreCartError } from './store-errors';

/// Минимум данных строки для серверных лимитов товара (S1): `isUnique` и
/// `maxPerPurchase`. Набор (bundle) не относится к товару — productId = null,
/// такие строки лимитами не ограничиваются.
export interface CartLimitLine {
  productId: string | null;
  productName: string;
  quantity: number;
  isUnique: boolean;
  maxPerPurchase: number | null;
}

/// Проверка итогового состояния корзины (после добавления/изменения/перед
/// заказом). Лимиты — на товар целиком: количество суммируется по всем
/// строкам/вариантам/получателям подарка. Уникальный товар — не более одной
/// штуки и одной строки.
/// `onlyProductId` (L1): add/patch проверяют только товар, затронутый
/// операцией (null — набор, лимитов нет); старые нарушения других товаров в
/// корзине не блокируют операцию. Без аргумента — полная проверка (заказ).
export function assertCartLimits(
  lines: CartLimitLine[],
  onlyProductId?: string | null,
): void {
  if (onlyProductId === null) {
    return;
  }
  const byProduct = new Map<
    string,
    { lines: number; quantity: number; line: CartLimitLine }
  >();
  for (const line of lines) {
    if (
      !line.productId ||
      (onlyProductId && line.productId !== onlyProductId)
    ) {
      continue;
    }
    const entry = byProduct.get(line.productId);
    if (entry) {
      entry.lines += 1;
      entry.quantity += line.quantity;
    } else {
      byProduct.set(line.productId, {
        lines: 1,
        quantity: line.quantity,
        line,
      });
    }
  }
  for (const { lines: lineCount, quantity, line } of byProduct.values()) {
    if (line.isUnique && (lineCount > 1 || quantity > 1)) {
      throw conflict(
        StoreCartError.CART_UNIQUE_DUPLICATE,
        `Товар «${line.productName}» уникальный: его можно купить только один раз`,
      );
    }
    if (line.maxPerPurchase && quantity > line.maxPerPurchase) {
      throw badRequest(
        StoreCartError.CART_MAX_PER_PURCHASE,
        `Максимум ${line.maxPerPurchase} шт. товара «${line.productName}» за покупку`,
      );
    }
  }
}
