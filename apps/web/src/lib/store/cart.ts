import type { DecimalString } from '@twomc/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { siteKeys } from '@/lib/site/hooks';
import { useAuthStore } from '@/lib/auth/store';

/// Корзина (слой 0, подэтап 0.2). Форма ответа — как её отдаёт API
/// (`GET /store/cart`, `POST /store/cart/calculate`, мутации корзины возвращают
/// тот же объект). ВСЕ суммы — строки Decimal от сервера: клиент ничего не
/// считает, только показывает (ADR-0009). Служебные поля товара не используются.

export interface CartLineView {
  productId: string | null;
  variantId: string | null;
  bundleId: string | null;
  quantity: number;
  unitPrice: DecimalString;
  lineSubtotal: DecimalString;
  bulkDiscount: DecimalString;
  lineTotal: DecimalString;
  giftToUserId: string | null;
  giftMessage: string | null;
  isGiftable: boolean;
  isSelfOnly: boolean;
  isUnique: boolean;
  name: string;
}

export interface CartItemView {
  id: string;
  quantity: number;
  productId: string | null;
  variantId: string | null;
  bundleId: string | null;
  giftToUserId?: string | null;
  giftMessage?: string | null;
  product?: { id: string; name: string; isGiftable?: boolean; isSelfOnly?: boolean } | null;
  bundle?: { id: string; name: string } | null;
}

/// Промокод в ответе корзины приходит целиком (N2, бэклог API); UI использует
/// только `code` и `description`.
export interface CartPromoView {
  code: string;
  description?: string | null;
}

/// Ошибка сохранённого промокода в ответе корзины (200). Локальный необязательный
/// тип: заменить на @twomc/shared после публикации API. Старый API поля не отдаёт.
export interface CartPromoError {
  code: string;
  message: string;
}

export interface CartView {
  id: string;
  promoError?: CartPromoError | null;
  items: CartItemView[];
  promoCode?: CartPromoView | null;
  lines: CartLineView[];
  subtotal: DecimalString;
  bulkDiscountTotal: DecimalString;
  loyaltyDiscountPercent: DecimalString;
  loyaltyDiscountTotal: DecimalString;
  promoDiscountTotal: DecimalString;
  discountAmount: DecimalString;
  total: DecimalString;
}

export function isPositive(value: DecimalString | undefined | null): boolean {
  return value !== undefined && value !== null && Number(value) > 0;
}

/// Позиция корзины и её расчётная строка идут в одном порядке (PricingService
/// обходит `items` по порядку). Если длины расходятся — строки не сопоставляем,
/// чтобы не показать цену не той позиции.
export function lineFor(cart: CartView, index: number): CartLineView | null {
  if (cart.lines.length !== cart.items.length) return null;
  return cart.lines[index] ?? null;
}

export function itemName(item: CartItemView, line: CartLineView | null): string {
  return item.product?.name ?? item.bundle?.name ?? line?.name ?? 'Товар';
}

/// Тексты по кодам ошибок API корзины. Неизвестный код — запасной путь по тексту.
const CODE_MESSAGES: Record<string, string> = {
  PROMO_NOT_FOUND: 'Промокод не найден. Проверьте написание.',
  PROMO_EXPIRED: 'Срок действия промокода истёк.',
  PROMO_NOT_STARTED: 'Промокод ещё не начал действовать.',
  PROMO_EXHAUSTED: 'Промокод исчерпан: лимит использований достигнут.',
  PROMO_ALREADY_USED: 'Вы уже использовали этот промокод.',
  PROMO_MIN_AMOUNT: 'Сумма корзины ниже минимальной для этого промокода.',
  PROMO_NOT_APPLICABLE: 'Промокод не подходит к товарам в корзине.',
  CART_UNIQUE_DUPLICATE: 'Этот товар покупается один раз, он уже лежит в корзине.',
  CART_UNIQUE_ALREADY_OWNED: 'Этот товар у вас уже есть, повторно его купить нельзя.',
  CART_GIFT_UNAVAILABLE: 'Этот товар нельзя подарить.',
  CART_GIFT_NOT_ALLOWED: 'Подарок этому игроку невозможен. Проверьте ник получателя.',
};

/// Запасной разбор для старого API без `code`: определяем код по русскому тексту.
const TEXT_CODES: Array<[RegExp, string]> = [
  [/промокод не найден/i, 'PROMO_NOT_FOUND'],
  [/срок действия промокода|промокод.*истёк/i, 'PROMO_EXPIRED'],
  [/промокод.*(исчерпан|лимит)/i, 'PROMO_EXHAUSTED'],
  [/минимальн/i, 'PROMO_MIN_AMOUNT'],
  [/максимум \d+ шт/i, 'CART_MAX_PER_PURCHASE'],
];

function resolveCode(error: ApiError): string | undefined {
  if (error.code) return error.code;
  const text = error.messages.join(' ');
  return TEXT_CODES.find(([pattern]) => pattern.test(text))?.[1];
}

/// Секунды из `Retry-After` (клиент) либо из тела 429 (`retryAfter`).
function retryAfterOf(error: ApiError): number | undefined {
  if (error.retryAfterSeconds) return error.retryAfterSeconds;
  const body = error.body as { retryAfter?: unknown } | null | undefined;
  const value = Number(body?.retryAfter);
  return Number.isFinite(value) && value > 0 ? Math.ceil(value) : undefined;
}

function waitPhrase(seconds: number | undefined): string {
  if (!seconds) return 'Попробуйте чуть позже.';
  if (seconds < 60) return `Повторите через ${seconds} сек.`;
  return `Повторите через ${Math.ceil(seconds / 60)} мин.`;
}

/// Понятный текст ошибки: сначала по `error.code`, затем по тексту сообщения
/// (сообщения API по корзине и промокодам русские — отдаются как есть).
export function cartErrorMessage(error: unknown, fallback = 'Не удалось выполнить действие.') {
  if (!(error instanceof ApiError)) return fallback;
  if (error.code === 'CART_GIFT_RATE_LIMITED') {
    return `Слишком много попыток сменить получателя подарка. ${waitPhrase(retryAfterOf(error))}`;
  }
  if (error.status === 429) {
    return `Слишком много запросов. ${waitPhrase(retryAfterOf(error))}`;
  }
  if (error.status >= 500) return 'Сервер временно недоступен. Попробуйте позже.';
  const code = resolveCode(error);
  // Для лимита на покупку сервер указывает число: берём его текст.
  if (code && code !== 'CART_MAX_PER_PURCHASE' && CODE_MESSAGES[code]) return CODE_MESSAGES[code];
  if (code === 'CART_MAX_PER_PURCHASE') {
    return error.messages[0] ?? 'Достигнут максимум количества этого товара за покупку.';
  }
  return error.messages[0] ?? fallback;
}

/// Текст предупреждения о сохранённом промокоде из `promoError` (200-ответ).
export function promoErrorMessage(promoError: CartPromoError): string {
  return CODE_MESSAGES[promoError.code] ?? promoError.message;
}

/// Ошибка GET корзины, после которой помогает сброс промокода: сервер при
/// пересчёте валидирует сохранённый код заново (истёк, исчерпан, ниже минимума).
export function isPromoProblem(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status >= 400 &&
    error.status < 500 &&
    /промокод|минимальн/i.test(error.messages.join(' '))
  );
}

function useIsAuthenticated(): boolean {
  return useAuthStore((state) => state.status === 'authenticated');
}

export function useCartView() {
  const authenticated = useIsAuthenticated();
  return useQuery({
    queryKey: siteKeys.cart,
    queryFn: () => api.get<CartView>('/store/cart'),
    enabled: authenticated,
    retry: false,
  });
}

export interface AddToCartInput {
  variantId: string;
  quantity: number;
}

/// Мутации корзины: ответ сервера (с пересчитанными суммами) кладётся в кэш,
/// при ошибке корзина перечитывается — сервер мог уже сохранить часть изменения
/// (например, количество, после которого промокод перестал подходить).
export function useCartMutations() {
  const client = useQueryClient();
  const sync = (data: CartView) => client.setQueryData(siteKeys.cart, data);
  const resync = () => client.invalidateQueries({ queryKey: siteKeys.cart });
  const options = { onSuccess: sync, onError: resync };

  return {
    add: useMutation({
      mutationFn: (input: AddToCartInput) => api.post<CartView>('/store/cart/items', input),
      ...options,
    }),
    setQuantity: useMutation({
      mutationFn: ({ id, quantity }: { id: string; quantity: number }) =>
        api.patch<CartView>(`/store/cart/items/${encodeURIComponent(id)}`, { quantity }),
      ...options,
    }),
    setGift: useMutation({
      mutationFn: ({
        id,
        giftToUsername,
        giftMessage,
      }: {
        id: string;
        giftToUsername: string;
        giftMessage: string;
      }) =>
        api.patch<CartView>(`/store/cart/items/${encodeURIComponent(id)}`, {
          giftToUsername,
          giftMessage,
        }),
      ...options,
    }),
    remove: useMutation({
      mutationFn: (id: string) =>
        api.delete<CartView>(`/store/cart/items/${encodeURIComponent(id)}`),
      ...options,
    }),
    clear: useMutation({
      mutationFn: () => api.delete<CartView>('/store/cart'),
      ...options,
    }),
    applyPromo: useMutation({
      mutationFn: (code: string) => api.post<CartView>('/store/cart/apply-promo', { code }),
      ...options,
    }),
    removePromo: useMutation({
      mutationFn: () => api.delete<CartView>('/store/cart/promo'),
      ...options,
    }),
  };
}
