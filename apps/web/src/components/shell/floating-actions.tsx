'use client';

import { MessageCircle, ShoppingCart } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button, IconButton } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SkeletonRows } from '@/components/ui/skeleton';
import { Tooltip } from '@/components/ui/tooltip';
import { useAuthStore } from '@/lib/auth/store';
import { cn } from '@/lib/cn';
import { formatMoney, formatNumber, plural } from '@/lib/format';
import { cartCount, usePublicSiteSettings, useCart } from '@/lib/site/hooks';

/// Корзина видна только в store-зоне (/shop*), для вошедших — с реальным
/// счётчиком из GET /store/cart; анонимам — приглашение войти.
export function CartButton() {
  const authenticated = useAuthStore((state) => state.status === 'authenticated');
  const cart = useCart(true);
  const count = cartCount(cart.data);
  return (
    <Popover>
      <Tooltip content="Корзина" side="left">
        <PopoverTrigger asChild>
          <IconButton
            aria-label={
              count > 0
                ? `Корзина, ${count} ${plural(count, { one: 'товар', few: 'товара', many: 'товаров' })}`
                : 'Корзина'
            }
            variant="secondary"
            className="relative size-12 rounded-full shadow-lg"
            data-testid="cart-button"
          >
            <ShoppingCart />
            {count > 0 ? (
              <span
                data-testid="cart-count"
                className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground tabular"
              >
                {count > 99 ? '99+' : count}
              </span>
            ) : null}
          </IconButton>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent side="top" align="end" className="w-80 p-0">
        <div className="border-b border-border-subtle px-3 py-2">
          <p className="text-sm font-semibold">Корзина</p>
        </div>
        {!authenticated ? (
          <div className="p-4 text-sm text-muted-foreground">
            Войдите, чтобы собирать корзину.
            <Button asChild size="sm" className="mt-3 w-full">
              <Link href="/login?next=/shop">Войти</Link>
            </Button>
          </div>
        ) : cart.isPending ? (
          <div className="p-3">
            <SkeletonRows rows={3} />
          </div>
        ) : cart.isError || !cart.data || cart.data.items.length === 0 ? (
          <EmptyState
            size="sm"
            icon={<ShoppingCart />}
            title="Корзина пуста"
            description="Добавьте товары из магазина."
          />
        ) : (
          <>
            <ul className="max-h-72 overflow-y-auto scrollbar-thin">
              {cart.data.items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-3 border-b border-border-subtle px-3 py-2 text-sm last:border-b-0"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {item.product?.name ?? item.bundle?.name ?? 'Товар'}
                    {item.variant?.name ? (
                      <span className="text-muted-foreground"> · {item.variant.name}</span>
                    ) : null}
                  </span>
                  <span className="text-xs text-muted-foreground tabular">
                    ×{formatNumber(item.quantity)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between px-3 py-2 text-sm">
              <span className="text-muted-foreground">Итого</span>
              <span className="font-semibold tabular">
                {cart.data.total !== undefined ? formatMoney(cart.data.total) : '—'}
              </span>
            </div>
            <div className="flex gap-2 border-t border-border-subtle p-2">
              <Button asChild variant="secondary" size="sm" className="flex-1">
                <Link href="/shop/cart">Перейти в корзину</Link>
              </Button>
              <Button asChild size="sm" className="flex-1">
                <Link href="/shop/checkout">Оформить</Link>
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

/// Кнопка чата: сайт-чат (PHASE 11 backend, WebSocket) ещё не имеет
/// frontend-клиента — кнопка показывает честное состояние «скоро», без
/// фейкового чата. Скрыта, если модуль чата выключен в настройках сайта.
export function ChatButton() {
  const settings = usePublicSiteSettings();
  if (settings.data && !settings.data.modules.chat) {
    return null;
  }
  return (
    <Tooltip content="Чат — скоро" side="left">
      <IconButton
        aria-label="Чат (скоро)"
        variant="secondary"
        className="size-12 rounded-full shadow-lg"
        disabled
        data-testid="chat-button"
      >
        <MessageCircle />
      </IconButton>
    </Tooltip>
  );
}

/// Единая точка плавающих действий: показываем только нужное в контексте
/// (корзина — в магазине), не больше 2–3 кнопок. Над футером и мобильной
/// навигацией — отступ по safe-area.
export function GlobalFloatingActions({ className }: { className?: string }) {
  const pathname = usePathname();
  const inStore = pathname === '/shop' || pathname.startsWith('/shop/');
  return (
    <div
      data-testid="floating-actions"
      className={cn(
        'fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-floating flex flex-col items-end gap-3',
        'max-lg:bottom-[calc(4rem+max(0.75rem,env(safe-area-inset-bottom)))]',
        className,
      )}
    >
      {inStore ? <CartButton /> : null}
      <ChatButton />
    </div>
  );
}
