'use client';

import { Heart, ShoppingBag, Trash2, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ModuleGate } from '@/components/system/site-availability';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button, IconButton } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { ProtectedImage } from '@/components/ui/protected-image';
import { Skeleton } from '@/components/ui/skeleton';
import { SwitchField } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast';
import { getErrorMessage } from '@/lib/api/errors';
import { useAuthStore } from '@/lib/auth/store';
import { ProductPrice } from '../_components/product-card';
import { useWishlist, useWishlistMutations, type WishlistItem } from '@/lib/store/wishlist';

function WishlistSkeleton() {
  return (
    <div role="status" data-testid="wishlist-skeleton" className="flex flex-col gap-2">
      <span className="sr-only">Загрузка избранного…</span>
      {Array.from({ length: 3 }, (_, index) => (
        <Skeleton key={index} className="h-20 w-full rounded-lg" />
      ))}
    </div>
  );
}

function Row({
  item,
  removing,
  onRemove,
}: {
  item: WishlistItem;
  removing: boolean;
  onRemove: () => void;
}) {
  const { product } = item;
  return (
    <li
      data-testid="wishlist-row"
      className="flex items-center gap-3 rounded-lg bg-surface p-3 shadow-sm"
    >
      <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded bg-surface-sunken">
        {product.image ? (
          <ProtectedImage
            src={product.image}
            alt=""
            width={64}
            height={64}
            className="size-full object-cover"
          />
        ) : (
          <ShoppingBag aria-hidden className="size-6 text-subtle-foreground" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Link
          href={`/shop/${encodeURIComponent(product.slug)}`}
          className="truncate rounded-sm text-sm font-semibold outline-none max-md:py-2.5 hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          {product.name}
        </Link>
        <ProductPrice product={product} className="text-sm tabular text-muted-foreground" />
      </div>
      <IconButton
        aria-label={`Убрать из избранного: ${product.name}`}
        variant="ghost"
        loading={removing}
        onClick={onRemove}
      >
        <Trash2 />
      </IconButton>
    </li>
  );
}

function WishlistContent() {
  const status = useAuthStore((state) => state.status);
  const pathname = usePathname();
  const query = useWishlist();
  const { remove, visibility } = useWishlistMutations();

  if (status === 'idle' || status === 'loading') return <WishlistSkeleton />;
  if (status !== 'authenticated') {
    return (
      <EmptyState
        icon={<UserRound />}
        title="Войдите, чтобы увидеть избранное"
        description="Избранное хранится в вашем аккаунте."
        action={
          <Button asChild>
            <Link href={`/login?next=${encodeURIComponent(pathname || '/shop/wishlist')}`}>
              Войти
            </Link>
          </Button>
        }
      />
    );
  }
  if (query.isPending) return <WishlistSkeleton />;
  if (query.isError) {
    return (
      <ErrorState error={query.error} onRetry={() => query.refetch()} retrying={query.isFetching} />
    );
  }
  const { items, isPublic } = query.data;
  return (
    <div className="flex flex-col gap-4">
      <SwitchField
        label="Показывать избранное другим игрокам"
        description="Список будет доступен по вашему нику."
        checked={isPublic}
        disabled={visibility.isPending}
        onCheckedChange={(next) =>
          visibility.mutate(next, { onError: (error) => toast.error(getErrorMessage(error)) })
        }
      />
      {items.length === 0 ? (
        <EmptyState
          icon={<Heart />}
          title="Избранное пусто"
          description="Добавляйте товары из каталога, чтобы не потерять их."
          action={
            <Button asChild>
              <Link href="/shop">В магазин</Link>
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-2" data-testid="wishlist">
          {items.map((item) => (
            <Row
              key={item.id}
              item={item}
              removing={remove.isPending && remove.variables === item.productId}
              onRemove={() =>
                remove.mutate(item.productId, {
                  onError: (error) => toast.error(getErrorMessage(error)),
                })
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/// Избранное: свои товары, удаление и публичность списка. Модуль «store» выключен — ModuleGate.
export default function WishlistPage() {
  return (
    <ModuleGate module="store">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-4 py-8 md:px-6">
        <Breadcrumbs items={[{ label: 'Магазин', href: '/shop' }, { label: 'Избранное' }]} />
        <h1 className="font-display text-2xl font-bold md:text-3xl">Избранное</h1>
        <div className="max-w-3xl">
          <WishlistContent />
        </div>
      </div>
    </ModuleGate>
  );
}
