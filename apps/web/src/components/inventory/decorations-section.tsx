'use client';

import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { QueryBoundary } from '@/components/admin/query-boundary';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonRows } from '@/components/ui/skeleton';
import { useMyDecorations, type OwnedDecoration } from '@/lib/inventory/inventory';

function DecorationImage({ decoration }: { decoration: OwnedDecoration['decoration'] }) {
  const [broken, setBroken] = useState(false);
  if (!decoration.imageUrl || broken) {
    return <Sparkles aria-hidden className="size-8 text-primary" />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- CDN/хранилище twomc.su
    <img
      src={decoration.imageUrl}
      alt=""
      aria-hidden
      width={48}
      height={48}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setBroken(true)}
      className="size-12 object-contain"
    />
  );
}

/// Украшения сайта — вторая часть снимка «Мой инвентарь».
export function DecorationsSection() {
  const query = useMyDecorations();
  return (
    <section
      aria-labelledby="inventory-decorations-title"
      className="flex flex-col gap-3 rounded-xl bg-surface p-5 shadow-sm"
    >
      <h3 id="inventory-decorations-title" className="text-lg font-semibold">
        Украшения сайта
      </h3>
      <QueryBoundary query={query} size="sm" skeleton={<SkeletonRows rows={2} />}>
        {(owned) =>
          owned.length === 0 ? (
            <EmptyState
              size="sm"
              icon={<Sparkles />}
              title="Украшений пока нет"
              description="Получить украшения можно в магазине и за события."
              data-testid="decorations-empty"
            />
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6">
              {owned.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-col items-center gap-1 rounded-md border border-border-subtle bg-surface-sunken p-3 text-center"
                >
                  <DecorationImage decoration={entry.decoration} />
                  <span className="break-words text-xs">{entry.decoration.name}</span>
                </li>
              ))}
            </ul>
          )
        }
      </QueryBoundary>
    </section>
  );
}
