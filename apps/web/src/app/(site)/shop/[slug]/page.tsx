'use client';

import {
  Check,
  Gift,
  Minus,
  PackageX,
  Plus,
  ShoppingBag,
  ShoppingCart,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useId, useState } from 'react';
import { ModuleGate } from '@/components/system/site-availability';
import { Badge } from '@/components/ui/badge';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button, IconButton } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { ProtectedImage } from '@/components/ui/protected-image';
import { SafeMarkdown } from '@/components/ui/safe-markdown';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api/errors';
import { useAuthStore } from '@/lib/auth/store';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/format';
import {
  activeVariants,
  durationLabel,
  quantityLimit,
  useBoughtTogether,
  useStoreProduct,
  type StoreProduct,
  type StoreVariant,
} from '@/lib/store/catalog';
import { ProductCard } from '../_components/product-card';

function ProductSkeleton() {
  return (
    <div
      role="status"
      data-testid="product-skeleton"
      className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
    >
      <span className="sr-only">Загрузка товара…</span>
      <Skeleton className="aspect-[4/3] w-full rounded-lg" />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-10 w-1/2" />
      </div>
    </div>
  );
}

function Gallery({ product }: { product: StoreProduct }) {
  const pictures = Array.from(
    new Set([product.image, ...(product.images ?? [])].filter((src): src is string => !!src)),
  );
  const [index, setIndex] = useState(0);
  const current = pictures[Math.min(index, pictures.length - 1)];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg bg-surface-sunken">
        {current ? (
          <ProtectedImage
            src={current}
            alt={product.name}
            width={640}
            height={480}
            priority
            className="h-full w-full object-cover"
          />
        ) : (
          <ShoppingBag aria-hidden className="size-12 text-subtle-foreground" />
        )}
      </div>
      {pictures.length > 1 ? (
        <ul aria-label="Изображения товара" className="flex flex-wrap gap-2">
          {pictures.map((src, i) => (
            <li key={src}>
              <button
                type="button"
                aria-label={`Изображение ${i + 1} из ${pictures.length}`}
                aria-pressed={i === index}
                onClick={() => setIndex(i)}
                className={cn(
                  'relative size-16 overflow-hidden rounded border-2 bg-surface-sunken',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  i === index ? 'border-primary' : 'border-border-subtle',
                )}
              >
                <ProtectedImage
                  src={src}
                  alt=""
                  width={64}
                  height={64}
                  className="h-full w-full object-cover"
                />
                {i === index ? (
                  <span
                    aria-hidden
                    data-testid="thumb-selected"
                    className="absolute right-0.5 top-0.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground"
                  >
                    <Check className="size-3.5" />
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function VariantPicker({
  variants,
  value,
  onChange,
}: {
  variants: StoreVariant[];
  value: string;
  onChange: (id: string) => void;
}) {
  const name = useId();
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-semibold">Вариант</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {variants.map((variant) => {
          const checked = variant.id === value;
          return (
            <label key={variant.id} className="relative block cursor-pointer">
              <input
                type="radio"
                name={name}
                value={variant.id}
                checked={checked}
                onChange={() => onChange(variant.id)}
                className="peer sr-only"
              />
              <span
                className={cn(
                  'flex flex-col gap-0.5 rounded-lg border p-3 pr-9 transition-colors',
                  'peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background',
                  checked
                    ? 'border-primary bg-primary-soft'
                    : 'border-border bg-surface hover:bg-muted',
                )}
              >
                {checked ? (
                  <span
                    aria-hidden
                    data-testid="variant-selected"
                    className="absolute right-2.5 top-2.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground"
                  >
                    <Check className="size-3.5" />
                  </span>
                ) : null}
                <span className="text-sm font-medium">{durationLabel(variant.duration)}</span>
                <span className="font-display text-lg font-bold tabular">
                  {formatMoney(variant.price)}
                </span>
                {variant.oldPrice && Number(variant.oldPrice) > Number(variant.price) ? (
                  <span className="text-xs text-muted-foreground">
                    <span className="sr-only">Старая цена: </span>
                    <s>{formatMoney(variant.oldPrice)}</s>
                  </span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function QuantityField({
  value,
  max,
  hint,
  onChange,
}: {
  value: number;
  max: number;
  hint?: string;
  onChange: (next: number) => void;
}) {
  const id = useId();
  const hintId = useId();
  // Строка поля хранится отдельно: пустое поле при вводе не сбрасывается в 1,
  // значение приводится к допустимому на blur.
  const [text, setText] = useState(String(value));
  const [note, setNote] = useState('');
  const limitNote = `Достигнут предел: не больше ${max}.`;
  const clamp = (n: number) => Math.min(max, Math.max(1, Number.isFinite(n) ? Math.trunc(n) : 1));
  const commit = (next: number) => {
    const clamped = clamp(next);
    setText(String(clamped));
    onChange(clamped);
    setNote(next > max ? limitNote : '');
  };
  const atMin = value <= 1;
  const atMax = value >= max;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        Количество
      </label>
      <div className="flex items-center gap-2">
        <IconButton
          type="button"
          variant="secondary"
          aria-label="Уменьшить количество"
          aria-disabled={atMin}
          onClick={() => {
            if (!atMin) commit(value - 1);
          }}
        >
          <Minus />
        </IconButton>
        <input
          id={id}
          // Не числовой type: у него нативные стрелки браузера (ADR-0087).
          type="text"
          role="spinbutton"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          aria-valuemin={1}
          aria-valuemax={max}
          aria-valuenow={value}
          value={text}
          aria-describedby={hint ? hintId : undefined}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
            event.preventDefault();
            commit(value + (event.key === 'ArrowUp' ? 1 : -1));
          }}
          onChange={(event) => {
            const raw = event.target.value;
            // Только цифры: прочие символы игнорируются.
            if (!/^\d*$/.test(raw)) return;
            setText(raw);
            const parsed = raw === '' ? Number.NaN : Number(raw);
            if (raw === '' || !Number.isFinite(parsed)) return;
            if (parsed > max) {
              commit(parsed);
            } else if (parsed >= 1) {
              setNote('');
              onChange(Math.trunc(parsed));
            }
          }}
          onBlur={() => {
            commit(text.trim() === '' ? value : Number(text));
          }}
          className="h-control w-20 rounded border border-border-subtle bg-background-subtle px-2 text-center text-sm tabular focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        />
        <IconButton
          type="button"
          variant="secondary"
          aria-label="Увеличить количество"
          aria-disabled={atMax}
          onClick={() => {
            if (atMax) {
              setNote(limitNote);
            } else {
              commit(value + 1);
            }
          }}
        >
          <Plus />
        </IconButton>
      </div>
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      <p role="status" data-testid="quantity-note" className="sr-only">
        {note}
      </p>
    </div>
  );
}

function ProductDetails({ product }: { product: StoreProduct }) {
  const signedIn = useAuthStore((state) => state.status === 'authenticated');
  const variants = activeVariants(product);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const hintId = useId();

  const selected = variants.find((variant) => variant.id === variantId) ?? variants[0] ?? null;
  const unique = product.isUnique === true;
  const max = quantityLimit(product);

  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Gallery product={product} />
      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {product.isNew ? <Badge tone="primary">Новинка</Badge> : null}
            {product.isPopular ? <Badge>Популярное</Badge> : null}
            {unique ? <Badge tone="info">Покупается один раз</Badge> : null}
            {product.isGiftable ? (
              <Badge icon={<Gift aria-hidden className="size-3.5" />}>Можно подарить</Badge>
            ) : null}
          </div>
          <h1 className="font-display text-2xl font-bold md:text-3xl">{product.name}</h1>
          {product.description ? (
            <p className="text-base text-muted-foreground">{product.description}</p>
          ) : null}
        </div>

        {product.alreadyPurchased ? (
          <p
            data-testid="already-purchased"
            role="status"
            className="flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2 text-sm font-medium text-foreground"
          >
            <Check aria-hidden className="size-4 text-success" />
            Вы уже купили этот товар — повторно он не продаётся.
          </p>
        ) : null}

        {selected ? (
          <>
            <VariantPicker
              variants={variants}
              value={selected.id}
              onChange={(id) => setVariantId(id)}
            />
            {unique ? (
              <p className="text-sm text-muted-foreground">
                Уникальный товар: покупается один раз, количество — 1.
              </p>
            ) : (
              <>
                <QuantityField
                  value={quantity}
                  max={max}
                  hint={
                    product.maxPerPurchase
                      ? `Не больше ${product.maxPerPurchase} за одну покупку.`
                      : undefined
                  }
                  onChange={setQuantity}
                />
              </>
            )}
            <div className="flex flex-col gap-2 border-t border-border-subtle pt-4">
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  size="lg"
                  aria-disabled="true"
                  aria-describedby={hintId}
                  onClick={(event) => event.preventDefault()}
                >
                  <ShoppingCart />В корзину
                </Button>
                {!signedIn ? (
                  <Button asChild variant="secondary" size="lg">
                    <Link href={`/login?next=${encodeURIComponent(`/shop/${product.slug}`)}`}>
                      <UserRound />
                      Войти
                    </Link>
                  </Button>
                ) : null}
              </div>
              <p id={hintId} className="text-xs text-muted-foreground">
                Корзина и оформление заказа появятся в ближайшем обновлении.
                {!signedIn ? ' Для покупок понадобится вход в аккаунт.' : ''}
              </p>
            </div>
          </>
        ) : (
          <p
            role="status"
            data-testid="unavailable"
            className="flex items-center gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm font-medium text-foreground"
          >
            <PackageX aria-hidden className="size-4 text-warning" />
            Нет в наличии: у товара нет доступных вариантов.
          </p>
        )}

        {product.fullDescription ? (
          <section aria-labelledby="product-about" className="flex flex-col gap-2">
            <h2 id="product-about" className="text-sm font-semibold">
              Описание
            </h2>
            <SafeMarkdown source={product.fullDescription} />
          </section>
        ) : null}
      </div>
    </div>
  );
}

function BoughtTogether({ slug }: { slug: string }) {
  const query = useBoughtTogether(slug);
  const items = query.data ?? [];
  // Блок вторичный: при ошибке или пустом ответе просто не показываем.
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="bought-together" className="flex flex-col gap-3">
      <h2 id="bought-together" className="font-display text-lg font-bold">
        Покупают вместе
      </h2>
      <ul
        data-testid="bought-together"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      >
        {items.map((item) => (
          <ProductCard key={item.id} product={item} headingLevel={3} />
        ))}
      </ul>
    </section>
  );
}

function ProductPageContent() {
  const { slug } = useParams<{ slug: string }>();
  const query = useStoreProduct(slug);

  let body;
  if (query.isPending) {
    body = <ProductSkeleton />;
  } else if (query.isError) {
    const error = query.error;
    body =
      error instanceof ApiError && error.status === 404 ? (
        <EmptyState
          icon={<PackageX />}
          title="Товар не найден"
          description="Возможно, его убрали из продажи или ссылка устарела."
          action={
            <Button asChild variant="secondary">
              <Link href="/shop">Вернуться в магазин</Link>
            </Button>
          }
        />
      ) : (
        <ErrorState error={error} onRetry={() => query.refetch()} retrying={query.isFetching} />
      );
  } else {
    body = (
      <>
        <ProductDetails key={query.data.id} product={query.data} />
        <BoughtTogether slug={query.data.slug} />
      </>
    );
  }

  const product = query.data;
  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-8 px-4 py-8 md:px-6">
      <Breadcrumbs
        items={[{ label: 'Магазин', href: '/shop' }, { label: product?.name ?? 'Товар' }]}
      />
      <div className="flex flex-col gap-8">{body}</div>
    </div>
  );
}

/// Страница товара: реальные данные GET /store/products/:slug. Модуль «store»
/// выключен или на техработах (503 MODULE_DISABLED / MAINTENANCE, ADR-0082) —
/// понятное состояние вместо страницы.
export default function ProductPage() {
  return (
    <ModuleGate module="store">
      <ProductPageContent />
    </ModuleGate>
  );
}
