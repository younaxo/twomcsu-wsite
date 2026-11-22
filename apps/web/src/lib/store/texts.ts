import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

/// Публичные тексты магазина (0.11, ADR-0189): GET /store/texts. Это ПРОСТОЙ
/// текст: выводится только как текст (React экранирует; без
/// dangerouslySetInnerHTML и Markdown), переносы строк — CSS `white-space`.
/// Отсутствующие значения приходят пустой строкой.

export const STORE_TEXT_KEYS = [
  'store.text.shop_intro',
  'store.text.unban_rules',
  'store.text.unmute_rules',
  'store.text.refund_policy',
  'store.text.perk_descriptions',
  'store.text.checkout_notice',
] as const;
export type StoreTextKey = (typeof STORE_TEXT_KEYS)[number];
export type StoreTexts = Partial<Record<StoreTextKey, string>>;

export const storeTextsKey = ['store', 'texts'] as const;

export function useStoreTexts() {
  return useQuery({
    queryKey: storeTextsKey,
    queryFn: () => api.get<StoreTexts>('/store/texts'),
    staleTime: 60_000,
  });
}
