'use client';

import { BookOpen, Gift, Home, Server, ShoppingBag, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { BONUS_LINK, isSiteNavActive, SITE_NAVIGATION, type SiteIconName } from '@/lib/site/config';

const ICONS: Partial<Record<SiteIconName, LucideIcon>> = {
  home: Home,
  shop: ShoppingBag,
  rules: BookOpen,
  servers: Server,
  gift: Gift,
};

/// Пункты — из того же SITE_NAVIGATION, что и desktop rail (+ бонусы):
/// Главная, Магазин, Правила, Сервера, Бонусы. Никаких отдельных хардкодов.
export const MOBILE_NAV_ITEMS = [...SITE_NAVIGATION, { ...BONUS_LINK, exact: false }];

/// Высота плавающей панели + её нижний отступ — для padding контента/футера
/// и позиции плавающих кнопок (единое значение, без магических чисел).
export const MOBILE_NAV_CLEARANCE = 'calc(5.5rem + env(safe-area-inset-bottom))';

/// Открыта ли экранная клавиатура: visualViewport заметно меньше окна.
/// Панель на это время прячется, чтобы не прыгать над полем ввода.
function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => setOpen(viewport.height < window.innerHeight * 0.75);
    update();
    viewport.addEventListener('resize', update);
    return () => viewport.removeEventListener('resize', update);
  }, []);
  return open;
}

/// Мобильная навигация «Полдня»: отдельная плавающая solid-панель снизу —
/// отступы слева/справа/снизу (+ safe area iPhone и жестовая зона Android),
/// почти полукруглая форма, без рамки, без glass. Иконка + подпись, активный
/// раздел — фирменный оранжевый на мягкой подложке, без glow. Touch-target
/// каждого пункта ≥ 48px. В landscape (низкая высота) — компактный режим без
/// подписей. Скрыта на lg+ (там fixed rail) и пока открыта клавиатура.
/// Ниже модалок/шторок по z-index (z-sidebar < z-overlay).
export function MobileNav() {
  const pathname = usePathname();
  const keyboardOpen = useKeyboardOpen();
  return (
    <nav
      aria-label="Разделы сайта"
      data-testid="mobile-nav"
      data-hidden={keyboardOpen || undefined}
      className={cn(
        'fixed inset-x-3 z-sidebar mx-auto max-w-md lg:hidden',
        'bottom-[max(0.75rem,env(safe-area-inset-bottom))]',
        'transition-[transform,opacity] duration-fast motion-reduce:transition-none',
        keyboardOpen && 'pointer-events-none translate-y-[150%] opacity-0',
      )}
    >
      <ul
        data-testid="mobile-nav-surface"
        className="flex h-16 items-stretch gap-1 rounded-full bg-surface-raised p-1.5 shadow-lg edge-highlight [@media(max-height:480px)]:h-12"
      >
        {MOBILE_NAV_ITEMS.map((item) => {
          const Icon = ICONS[item.icon] ?? Home;
          const active = isSiteNavActive(item, pathname);
          return (
            <li key={item.href} className="min-w-0 flex-1">
              <Link
                href={item.href}
                aria-label={item.label}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-full min-h-12 flex-col items-center justify-center gap-0.5 rounded-full text-[11px] font-medium leading-none',
                  'transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                  '[@media(max-height:480px)]:min-h-0',
                  active
                    ? 'bg-primary-soft text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon aria-hidden className="size-5 shrink-0" />
                <span className="max-w-full truncate px-0.5 [@media(max-height:480px)]:sr-only">
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
