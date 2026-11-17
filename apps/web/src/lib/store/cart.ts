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

export interface CartView {
  id: string;
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

/// Понятный текст ошибки: сообщения API по корзине и промокодам уже русские
/// (cart.service / pricing.service). 404 «Промокод не найден» и пр. — как есть.
export function cartErrorMessage(error: unknown, fallback = 'Не удалось выполнить действие.') {
  if (error instanceof ApiError) {
    if (error.status === 429) return 'Слишком много запросов. Попробуйте чуть позже.';
    if (error.status >= 500) return 'Сервер временно недоступен. Попробуйте позже.';
    return error.messages[0] ?? fallback;
  }
  return fallback;
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
