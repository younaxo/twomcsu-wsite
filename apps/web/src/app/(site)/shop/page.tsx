'use client';

import type { DecimalString, Paginated } from '@twomc/shared';
import { useQuery } from '@tanstack/react-query';
import { Gift, ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { ProtectedImage } from '@/components/ui/protected-image';
import { PageHeader } from '@/components/admin/page-header';
import { QueryBoundary } from '@/components/admin/query-boundary';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { api } from '@/lib/api/client';
import { formatMoney } from '@/lib/format';
import { ModuleGate } from '@/components/system/site-availability';

interface ProductListItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image: string | null;
  category?: { id: string; name: string; slug: string } | null;
  variants?: { id: string; name?: string; price: DecimalString }[];
}

/// Магазин — реальный каталог (GET /store/products). Карточка товара,
/// корзина и оформление — PHASE 31; глобальная корзина уже доступна в
/// плавающих действиях.
function ShopPageContent() {
  const products = useQuery({
    queryKey: ['site', 'store', 'products'],
    queryFn: () =>
      api.get<Paginated<ProductListItem>>('/store/products', {
        auth: false,
        query: { page: 1, limit: 24 },
      }),
  });
  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-8 px-4 py-8 md:px-6">
      <PageHeader
        title="Магазин"
        description="Привилегии, кейсы и косметика для серверов twomc.su."
      />
      <QueryBoundary query={products}>
        {(data) =>
          data.items.length === 0 ? (
            <EmptyState
              icon={<ShoppingBag />}
              title="Товаров пока нет"
              description="Каталог наполняется администрацией."
            />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {data.items.map((product) => {
                const price = product.variants?.[0]?.price;
                return (
                  <li key={product.id} data-context="product" data-context-name={product.name}>
                    <Card className="flex h-full flex-col gap-3">
                      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded bg-surface-sunken">
                        {product.image ? (
                          <ProtectedImage
                            src={product.image}
                            alt=""
                            width={320}
                            height={240}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <ShoppingBag aria-hidden className="size-8 text-subtle-foreground" />
                        )}
                      </div>
                      <div className="min-w-0">
                        {product.category ? (
                          <p className="text-xs text-muted-foreground">{product.category.name}</p>
                        ) : null}
                        <h2 className="truncate text-base font-semibold">{product.name}</h2>
                        {product.description ? (
                          <p className="line-clamp-2 text-sm text-muted-foreground">
                            {product.description}
                          </p>
                        ) : null}
                      </div>
                      <p className="mt-auto font-display text-lg font-bold tabular">
                        {price !== undefined ? formatMoney(price) : '—'}
                      </p>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )
        }
      </QueryBoundary>
      <section id="bonus" className="scroll-mt-24">
        <Card variant="sunken" className="flex items-center gap-3">
          <Gift aria-hidden className="size-5 text-primary" />
          <div>
            <p className="text-sm font-semibold">Бонусы</p>
            <p className="text-sm text-muted-foreground">
              Монеты за голосование на сайтах-рейтингах —{' '}
              <Link href="/vote" className="font-medium text-primary hover:underline">
                на странице «Голосование»
              </Link>
              .
            </p>
          </div>
        </Card>
      </section>
    </div>
  );
}

/// Страница модуля «store» (ADR-0082): выключен или на техработах — понятное состояние.
export default function ShopPage() {
  return (
    <ModuleGate module="store">
      <ShopPageContent />
    </ModuleGate>
  );
}
