'use client';

import { BookOpen, Gift, Home, Server, ShoppingBag, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import { BONUS_LINK, isSiteNavActive, SITE_NAVIGATION, type SiteIconName } from '@/lib/site/config';

const ICONS: Partial<Record<SiteIconName, LucideIcon>> = {
  home: Home,
  shop: ShoppingBag,
  rules: BookOpen,
  servers: Server,
  gift: Gift,
};

/// Мобильная замена rail: нижняя панель с теми же разделами + бонусы.
/// Подписи видимы (на телефоне tooltip недоступен), активный — акцент.
export function MobileNav() {
  const pathname = usePathname();
  const items = [...SITE_NAVIGATION, { ...BONUS_LINK, exact: false }];
  return (
    <nav
      aria-label="Разделы сайта"
      data-testid="mobile-nav"
      className="fixed inset-x-0 bottom-0 z-sidebar border-t bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="flex h-16 items-stretch">
        {items.map((item) => {
          const Icon = ICONS[item.icon] ?? Home;
          const active = isSiteNavActive(item, pathname);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-label={item.label}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium',
                  active ? 'text-primary-soft-foreground' : 'text-muted-foreground',
                )}
              >
                <span
                  className={cn(
                    'flex h-7 w-12 items-center justify-center rounded-full',
                    active && 'bg-primary-soft',
                  )}
                >
                  <Icon aria-hidden className="size-5" />
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
