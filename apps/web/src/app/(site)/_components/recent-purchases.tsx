'use client';

import type { RecentPurchaseDto } from '@twomc/shared';
import { useQuery } from '@tanstack/react-query';
import { ShoppingBag } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api/client';
import { cn } from '@/lib/cn';
import { usePrefersReducedMotion } from '@/lib/use-media-query';

/// «Недавно купили» — компактная горизонтальная лента над магазином.
/// Источник — реальные завершённые заказы (`GET /store/recent-purchases`),
/// ник замаскирован backend-ом единым privacy-алгоритмом (`yo***o_`).
/// Лента прокручивается пользователем (overflow-x, колесо/свайп) и сама
/// медленно едет, пока на неё не навели/не коснулись/не сфокусировали;
/// prefers-reduced-motion выключает автодвижение. Без данных — честное
/// сообщение, без выдуманных покупок.

const AUTO_SPEED_PX_PER_S = 18;

export function useRecentPurchases() {
  return useQuery({
    queryKey: ['site', 'store', 'recent-purchases'],
    queryFn: () => api.get<RecentPurchaseDto[]>('/store/recent-purchases', { auth: false }),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

function PurchaseItem({ item }: { item: RecentPurchaseDto }) {
  return (
    <li className="flex shrink-0 items-center gap-2 rounded-full border bg-surface py-1 pl-1 pr-3 text-sm shadow-sm">
      <Avatar name={item.nickname} src={item.avatar} size="xs" shape="round" />
      <span
        className="font-medium tabular"
        data-context="user"
        data-context-username={item.nickname}
      >
        {item.nickname}
      </span>
      <span aria-hidden className="text-subtle-foreground">
        —
      </span>
      <span className="text-muted-foreground">
        {item.quantity > 1 ? `${item.quantity} × ` : ''}
        {item.productName}
      </span>
    </li>
  );
}

export function HomeRecentPurchases({ className }: { className?: string }) {
  const purchases = useRecentPurchases();
  const reducedMotion = usePrefersReducedMotion();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [interacting, setInteracting] = useState(false);
  const items = purchases.data ?? [];
  // Дублируем список для бесшовного цикла только если он шире контейнера.
  const loop = items.length > 0 ? [...items, ...items] : [];

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || reducedMotion || interacting || items.length === 0) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const half = scroller.scrollWidth / 2;
      if (scroller.scrollWidth > scroller.clientWidth + 1) {
        const delta = ((now - last) / 1000) * AUTO_SPEED_PX_PER_S;
        scroller.scrollLeft += delta;
        if (scroller.scrollLeft >= half) {
          // Вторая копия — та же лента: перескакиваем на эквивалентную позицию без скачка.
          scroller.scrollLeft -= half;
        }
      }
      last = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reducedMotion, interacting, items.length]);

  return (
    <div
      data-testid="recent-purchases"
      aria-label="Недавно купили"
      role="region"
      className={cn('flex flex-col gap-2', className)}
    >
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-subtle-foreground">
        <ShoppingBag aria-hidden className="size-3.5" />
        Недавно купили
      </p>
      {purchases.isPending ? (
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-9 w-48 shrink-0 rounded-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="recent-purchases-empty">
          Покупок пока не было — первые появятся здесь.
        </p>
      ) : (
        <div
          ref={scrollerRef}
          tabIndex={0}
          aria-label="Лента недавних покупок, прокручивается"
          className="scrollbar-none -mx-1 overflow-x-auto overscroll-x-contain px-1 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          onPointerEnter={() => setInteracting(true)}
          onPointerLeave={() => setInteracting(false)}
          onPointerDown={() => setInteracting(true)}
          onFocus={() => setInteracting(true)}
          onBlur={() => setInteracting(false)}
          onTouchStart={() => setInteracting(true)}
        >
          <ul className="flex w-max gap-2">
            {loop.map((item, index) => (
              <PurchaseItem key={`${index}-${item.productName}`} item={item} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
