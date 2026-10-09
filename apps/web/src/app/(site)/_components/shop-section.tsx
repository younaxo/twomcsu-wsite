'use client';

import type { ProductListItem } from '@twomc/shared';
import { ArrowRight, ShoppingBag } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMoney } from '@/lib/format';
import { pickShowcaseProducts, useHomeProducts } from './home-hooks';
import { HomeRecentPurchases } from './recent-purchases';
import { HomeSection } from './section';

function ProductCard({ product }: { product: ProductListItem }) {
  const price = product.variants?.[0]?.price;
  return (
    <article
      data-testid="home-product-card"
      className="flex h-full flex-col overflow-hidden rounded-xl border bg-surface shadow edge-highlight"
    >
      <div className="relative flex aspect-[4/3] items-center justify-center bg-surface-sunken">
        {product.image ? (
          <Image
            src={product.image}
            alt=""
            fill
            sizes="(min-width: 1024px) 25vw, 50vw"
            className="object-cover"
          />
        ) : (
          <ShoppingBag aria-hidden className="size-8 text-subtle-foreground" />
        )}
        {product.isFeatured || product.isPopular ? (
          <Badge
            tone={product.isFeatured ? 'primary' : 'neutral'}
            className="absolute left-3 top-3"
          >
            {product.isFeatured ? 'Рекомендуем' : 'Популярное'}
          </Badge>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        {product.category ? (
          <p className="text-xs text-muted-foreground">{product.category.name}</p>
        ) : null}
        <h3 className="truncate text-base font-semibold">{product.name}</h3>
        {product.description ? (
          <p className="line-clamp-2 text-sm text-muted-foreground">{product.description}</p>
        ) : null}
        <p className="mt-auto pt-2 font-display text-lg font-bold tabular">
          {price !== undefined ? formatMoney(price) : '—'}
        </p>
      </div>
    </article>
  );
}

/// Магазин на главной — 3–5 позиций (рекомендованные/популярные), не весь
/// каталог. Корзина — глобальная, на существующем store backend.
export function HomeShop() {
  const products = useHomeProducts();
  const items = pickShowcaseProducts(products.data?.items ?? []);
  return (
    <HomeSection
      id="shop"
      eyebrow="Магазин"
      title="Поддержать проект и получить больше"
      description="Привилегии, кейсы и косметика. Все средства идут на развитие twomc.su."
      action={
        <Button asChild size="sm">
          <Link href="/shop">
            Перейти в магазин
            <ArrowRight />
          </Link>
        </Button>
      }
    >
      <HomeRecentPurchases />
      {products.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="home-shop-grid">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div data-testid="home-shop-grid">
          <EmptyState
            icon={<ShoppingBag />}
            title="Каталог наполняется"
            description="Товары появятся, как только администрация опубликует их в магазине."
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="home-shop-grid">
          {items.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </HomeSection>
  );
}
