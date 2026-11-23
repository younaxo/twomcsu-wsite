'use client';

import { Gift, Search, ShoppingBag, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { QueryBoundary } from '@/components/admin/query-boundary';
import { ModuleGate } from '@/components/system/site-availability';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { Skeleton } from '@/components/ui/skeleton';
import { StoreIntroText, StoreTextsSection } from '@/components/store/store-texts';
import { cn } from '@/lib/cn';
import { formatNumber, plural } from '@/lib/format';
import { CATALOG_PAGE_SIZE, useStoreCategories, useStoreProducts } from '@/lib/store/catalog';
import { ProductCard } from './_components/product-card';

const SEARCH_DEBOUNCE_MS = 300;

function CatalogSkeleton() {
  return (
    <div role="status" data-testid="catalog-skeleton">
      <span className="sr-only">Загрузка каталога…</span>
      <ul aria-hidden className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <li key={index}>
            <Skeleton className="h-64 w-full rounded-lg" />
          </li>
        ))}
      </ul>
    </div>
  );
}

/// Каталог магазина — реальные данные (GET /store/products, /store/categories).
/// Фильтр по категории и поиск по названию выполняет сервер; цен в коде нет.
/// Корзина и оформление — подэтап 0.2.
function ShopPageContent() {
  const [categorySlug, setCategorySlug] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const categories = useStoreCategories();
  const products = useStoreProducts({ categorySlug, search, page });
  const filtered = categorySlug !== null || search.trim() !== '';

  const reset = () => {
    setCategorySlug(null);
    setSearchInput('');
    setSearch('');
    setPage(1);
  };

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-4 py-8 md:px-6">
      <PageHeader
        title="Магазин"
        description="Привилегии, кейсы и косметика для серверов twomc.su."
      />

      <StoreIntroText />

      <Card variant="sunken" className="flex flex-col gap-3">
        <div role="search" className="max-w-md">
          <label htmlFor="shop-search" className="sr-only">
            Поиск товара по названию
          </label>
          <Input
            id="shop-search"
            type="search"
            placeholder="Найти товар"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            leading={<Search />}
            maxLength={100}
            autoComplete="off"
          />
        </div>
        {categories.data && categories.data.length > 0 ? (
          <div role="group" aria-label="Категории" className="flex flex-wrap gap-2">
            {[{ id: 'all', name: 'Все', slug: null as string | null }, ...categories.data].map(
              (category) => {
                const active = category.slug === categorySlug;
                return (
                  <button
                    key={category.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setCategorySlug(category.slug);
                      setPage(1);
                    }}
                    className={cn(
                      'min-h-11 rounded-full border px-3.5 text-sm font-medium transition-colors sm:h-control-sm sm:min-h-0',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                      active
                        ? 'border-transparent bg-primary text-primary-foreground'
                        : 'border-border bg-surface text-foreground hover:bg-muted',
                    )}
                  >
                    {category.name}
                  </button>
                );
              },
            )}
          </div>
        ) : null}
      </Card>

      <div
        aria-live="polite"
        className="flex min-h-11 items-center text-sm text-muted-foreground sm:min-h-5"
      >
        {products.data
          ? `Найдено: ${formatNumber(products.data.total)} ${plural(products.data.total, {
              one: 'товар',
              few: 'товара',
              many: 'товаров',
            })}`
          : null}
      </div>

      <div aria-busy={products.isFetching} className="flex flex-col gap-6">
        <QueryBoundary query={products} skeleton={<CatalogSkeleton />}>
          {(data) =>
            data.items.length === 0 ? (
              <EmptyState
                icon={<ShoppingBag />}
                title={filtered ? 'Ничего не найдено' : 'Пока нет данных'}
                description={
                  filtered
                    ? 'Попробуйте другое название или сбросьте фильтры.'
                    : 'Товаров и наборов пока нет: каталог наполняется администрацией.'
                }
                action={
                  filtered ? (
                    <Button variant="secondary" size="sm" onClick={reset}>
                      <X />
                      Сбросить фильтры
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <>
                <ul
                  data-testid="catalog-list"
                  className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                >
                  {data.items.map((product) => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </ul>
                {data.total > CATALOG_PAGE_SIZE ? (
                  <Pagination
                    page={page}
                    totalPages={Math.max(1, Math.ceil(data.total / CATALOG_PAGE_SIZE))}
                    onPageChange={setPage}
                    label="Страницы каталога"
                    className="self-center"
                  />
                ) : null}
              </>
            )
          }
        </QueryBoundary>
      </div>

      <StoreTextsSection />

      <section id="bonus" aria-labelledby="bonus-title" className="scroll-mt-24">
        <Card variant="sunken" className="flex items-center gap-3">
          <Gift aria-hidden className="size-5 text-primary" />
          <div>
            <h2 id="bonus-title" className="text-sm font-semibold">
              Бонусы
            </h2>
            <p className="text-sm text-muted-foreground">
              Монеты за голосование на сайтах-рейтингах —{' '}
              <Link
                href="/vote"
                className="font-medium text-primary-soft-foreground underline underline-offset-2"
              >
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
