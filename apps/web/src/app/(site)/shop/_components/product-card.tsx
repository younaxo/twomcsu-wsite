import { ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ProtectedImage } from '@/components/ui/protected-image';
import { formatMoney } from '@/lib/format';
import { priceSummary, type StoreProduct } from '@/lib/store/catalog';

/// Цена карточки: «от X», если у товара варианты с разной ценой; «—», если
/// активных вариантов нет (товар нельзя купить). Значение — только из API.
export function ProductPrice({
  product,
  className,
}: {
  product: StoreProduct;
  className?: string;
}) {
  const { min, hasRange } = priceSummary(product);
  if (min === null) {
    return <span className={className}>Нет в наличии</span>;
  }
  return (
    <span className={className}>
      {hasRange ? <span className="mr-1 text-sm font-medium text-muted-foreground">от</span> : null}
      {formatMoney(min)}
    </span>
  );
}

/// Карточка каталога: вся карточка — одна ссылка на `/shop/[slug]`.
export function ProductCard({ product }: { product: StoreProduct }) {
  const available = priceSummary(product).min !== null;
  return (
    <li data-context="product" data-context-name={product.name}>
      <Card className="group relative flex h-full flex-col gap-3 transition-colors focus-within:ring-2 focus-within:ring-primary hover:border-border-strong">
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
          <div className="flex flex-wrap items-center gap-1.5">
            {product.category ? (
              <p className="text-xs text-muted-foreground">{product.category.name}</p>
            ) : null}
            {product.isNew ? <Badge tone="primary">Новинка</Badge> : null}
            {product.isPopular ? <Badge>Популярное</Badge> : null}
          </div>
          <h2 className="truncate text-base font-semibold">
            <Link
              href={`/shop/${product.slug}`}
              className="rounded-sm outline-none after:absolute after:inset-0 after:content-['']"
            >
              {product.name}
            </Link>
          </h2>
          {product.description ? (
            <p className="line-clamp-2 text-sm text-muted-foreground">{product.description}</p>
          ) : null}
        </div>
        <p
          className={
            available
              ? 'mt-auto font-display text-lg font-bold tabular'
              : 'mt-auto text-sm font-medium text-muted-foreground'
          }
        >
          <ProductPrice product={product} />
        </p>
      </Card>
    </li>
  );
}
