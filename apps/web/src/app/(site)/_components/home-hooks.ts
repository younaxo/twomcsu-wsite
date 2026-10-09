'use client';

import type { CalendarEventDto, NewsListItem, Paginated, ProductListItem } from '@twomc/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

/// Данные главной — только реальные публичные эндпоинты. Пустые ответы
/// отрисовываются честными empty state, фейковых событий/товаров нет.

export const homeKeys = {
  events: ['site', 'home', 'events'] as const,
  products: ['site', 'home', 'products'] as const,
  news: ['site', 'home', 'news'] as const,
};

export function useHomeEvents() {
  return useQuery({
    queryKey: homeKeys.events,
    queryFn: async () => {
      const [featured, upcoming] = await Promise.all([
        api.get<CalendarEventDto[]>('/events/featured', { auth: false }),
        api.get<Paginated<CalendarEventDto>>('/events', {
          auth: false,
          query: { page: 1, limit: 6 },
        }),
      ]);
      // Объединяем без дублей: featured — приоритет, затем ближайшие по дате.
      const seen = new Set<string>();
      const all = [...featured, ...upcoming.items].filter((event) => {
        if (seen.has(event.id)) return false;
        seen.add(event.id);
        return true;
      });
      return all.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    },
    staleTime: 60_000,
  });
}

/// Активное событие — идёт прямо сейчас; следующее — ближайшее будущее.
export function splitEvents(events: CalendarEventDto[], now: Date) {
  const ts = now.getTime();
  const live = events.filter((event) => {
    const start = Date.parse(event.startsAt);
    const end = event.endsAt ? Date.parse(event.endsAt) : start + 3 * 60 * 60 * 1000;
    return start <= ts && ts <= end && event.status === 'PUBLISHED';
  });
  const upcoming = events.filter(
    (event) => Date.parse(event.startsAt) > ts && event.status === 'PUBLISHED',
  );
  return { active: live[0] ?? null, next: upcoming[0] ?? null, upcoming };
}

export function useHomeProducts() {
  return useQuery({
    queryKey: homeKeys.products,
    queryFn: () =>
      api.get<Paginated<ProductListItem>>('/store/products', {
        auth: false,
        query: { page: 1, limit: 12 },
      }),
    staleTime: 60_000,
  });
}

/// 3–5 позиций: сначала рекомендованные/популярные, затем по порядку каталога.
export function pickShowcaseProducts(items: ProductListItem[], max = 4): ProductListItem[] {
  const prioritized = [
    ...items.filter((item) => item.isFeatured),
    ...items.filter((item) => item.isPopular && !item.isFeatured),
    ...items.filter((item) => !item.isFeatured && !item.isPopular),
  ];
  return prioritized.slice(0, max);
}

export function useHomeNews() {
  return useQuery({
    queryKey: homeKeys.news,
    queryFn: () => api.get<NewsListItem[]>('/news/latest', { auth: false, query: { limit: 12 } }),
    staleTime: 60_000,
  });
}
