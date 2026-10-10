'use client';

import { MessageCircle, ShoppingCart } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { ChatPanel } from '@/components/chat/chat-panel';
import { Button, IconButton } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { SkeletonRows } from '@/components/ui/skeleton';
import { Tooltip } from '@/components/ui/tooltip';
import { useAuthStore } from '@/lib/auth/store';
import { cn } from '@/lib/cn';
import { formatMoney, formatNumber, plural } from '@/lib/format';
import { cartCount, usePublicSiteSettings, useCart } from '@/lib/site/hooks';

/// Глобальные плавающие действия «Полдня»: обычные круглые solid-кнопки в
/// правом нижнем углу (без edge-peek и скрытых за краем контролов).
/// Корзина — только в store-зоне, со счётчиком 1…99+; чат — аккуратное
/// coming-soon состояние, пока нет frontend-клиента чата.

export function formatCount(count: number): string {
  return count > 99 ? '99+' : String(count);
}

const floatingButtonClassName =
  'relative size-12 rounded-full border bg-surface-overlay text-foreground shadow-lg hover:bg-surface-hover';

/// Корзина видна только в store-зоне (/shop*), для вошедших — с реальным
/// счётчиком из GET /store/cart; анонимам — приглашение войти.
export function CartButton({ className }: { className?: string }) {
  const authenticated = useAuthStore((state) => state.status === 'authenticated');
  const cart = useCart(true);
  const count = cartCount(cart.data);
  const label =
    count > 0
      ? `Корзина, ${count} ${plural(count, { one: 'товар', few: 'товара', many: 'товаров' })}`
      : 'Корзина';
  return (
    <Popover>
      <Tooltip content="Корзина" side="left">
        <PopoverTrigger asChild>
          <IconButton
            aria-label={label}
            variant="secondary"
            className={cn(floatingButtonClassName, className)}
            data-testid="cart-button"
          >
            <ShoppingCart />
            {count > 0 ? (
              <span
                data-testid="cart-count"
                className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground tabular"
              >
                {formatCount(count)}
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

/// Кнопка общего чата (срез 2.5, ADR-0113): открывает панель справа (на
/// телефоне — во всю ширину). Скрыта, если модуль чата выключен.
export function ChatButton({ className }: { className?: string }) {
  const settings = usePublicSiteSettings();
  const [open, setOpen] = useState(false);
  if (settings.data && !settings.data.modules.chat) {
    return null;
  }
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Tooltip content="Чат" side="left">
        <SheetTrigger asChild>
          <IconButton
            aria-label="Чат"
            variant="secondary"
            className={cn(floatingButtonClassName, className)}
            data-testid="chat-button"
          >
            <MessageCircle />
          </IconButton>
        </SheetTrigger>
      </Tooltip>
      <SheetContent side="right" size="md" className="flex flex-col gap-0 p-0">
        <SheetHeader className="px-4 pb-2 pt-4">
          <SheetTitle>Чат</SheetTitle>
          <SheetDescription className="sr-only">Общий чат twomc.su</SheetDescription>
        </SheetHeader>
        {open ? <ChatPanel /> : null}
      </SheetContent>
    </Sheet>
  );
}

/// Отступ снизу для окон из шапки (уведомления, mini profile), чтобы они не
/// заходили на зону плавающих кнопок: окна выше по z-index и иначе накрывают
/// круглые кнопки, а снизу торчит их срезанная дуга. Меряется при открытии по
/// фактической зоне (одна или две кнопки, desktop/mobile); кнопок нет — 8 px.
export function floatingClearance(): number {
  if (typeof document === 'undefined') return 8;
  const zone = document.querySelector('[data-testid="floating-actions"]');
  if (!zone) return 8;
  const rect = zone.getBoundingClientRect();
  if (rect.height === 0) return 8;
  return Math.max(8, Math.ceil(window.innerHeight - rect.top) + 8);
}

/// Единая точка плавающих действий: правый нижний угол, над футером и
/// мобильной навигацией (safe-area), ниже модалок и тостов по z-index.
export function GlobalFloatingActions({ className }: { className?: string }) {
  const pathname = usePathname();
  const inStore = pathname === '/shop' || pathname.startsWith('/shop/');
  return (
    <div
      data-testid="floating-actions"
      className={cn(
        'fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-floating flex flex-col items-end gap-3',
        'max-lg:bottom-[calc(5.5rem+env(safe-area-inset-bottom))]',
        className,
      )}
    >
      {inStore ? <CartButton /> : null}
      <ChatButton />
    </div>
  );
}
