/// Корзина магазина: машинные коды ошибок и добавочные типы ответа.
/// Тело 4xx: `{ code: StoreCartErrorCode, message: string }` (+ statusCode/error
/// от NestJS). UI ветвится по `code`, а не по тексту `message`.

export const STORE_CART_ERROR_CODES = {
  /// Промокод
  PROMO_NOT_FOUND: 'PROMO_NOT_FOUND',
  PROMO_NOT_STARTED: 'PROMO_NOT_STARTED',
  PROMO_EXPIRED: 'PROMO_EXPIRED',
  PROMO_EXHAUSTED: 'PROMO_EXHAUSTED',
  PROMO_NOT_APPLICABLE: 'PROMO_NOT_APPLICABLE',
  PROMO_MIN_AMOUNT: 'PROMO_MIN_AMOUNT',
  PROMO_FIRST_PURCHASE_ONLY: 'PROMO_FIRST_PURCHASE_ONLY',
  /// Лимиты товара
  CART_MAX_PER_PURCHASE: 'CART_MAX_PER_PURCHASE',
  CART_UNIQUE_DUPLICATE: 'CART_UNIQUE_DUPLICATE',
  CART_UNIQUE_ALREADY_OWNED: 'CART_UNIQUE_ALREADY_OWNED',
  /// Подарки: товар не подарочный / только для себя.
  CART_GIFT_NOT_ALLOWED: 'CART_GIFT_NOT_ALLOWED',
  /// Подарки: единый ответ для «нет такого игрока» и «нельзя подарить этому
  /// игроку» (защита от перебора ников).
  CART_GIFT_UNAVAILABLE: 'CART_GIFT_UNAVAILABLE',
} as const;

export type StoreCartErrorCode =
  (typeof STORE_CART_ERROR_CODES)[keyof typeof STORE_CART_ERROR_CODES];

export type StorePromoErrorCode = Extract<StoreCartErrorCode, `PROMO_${string}`>;

export interface StoreCartErrorBody {
  statusCode: number;
  code: StoreCartErrorCode;
  message: string;
}

/// Причина, по которой сохранённый в корзине промокод сейчас не действует.
/// Корзина при этом возвращается без скидки по промокоду.
export interface CartPromoError {
  code: StorePromoErrorCode;
  message: string;
}

/// Публичные поля промокода в ответе корзины (без лимитов и условий).
export interface CartPromoCodePublic {
  code: string;
  description: string | null;
  discountType: 'PERCENT' | 'FIXED' | 'BONUS';
  /// Decimal строкой.
  discountValue: string;
}

/// Добавка к строке расчёта: связь с позицией корзины.
export interface CartLineRef {
  /// id строки корзины (для PATCH/DELETE /store/cart/items/:id); в расчёте без
  /// корзины (быстрая покупка) строки нет.
  cartItemId: string | null;
}
