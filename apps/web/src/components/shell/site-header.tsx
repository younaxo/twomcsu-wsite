'use client';

import { Menu } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { IconButton } from '@/components/ui/button';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/cn';
import { isSiteNavActive, SITE_NAVIGATION } from '@/lib/site/config';
import { useAuthStore } from '@/lib/auth/store';
import { GlobalAlertBar } from './global-alert-bar';
import { NotificationsPopover } from './notifications-popover';
import { OnlineCounter } from './sidebar-rail';
import { ProfileMenu } from './profile-menu';
import { SeasonalHeaderDecoration } from './seasonal-header-decoration';
import { SiteLogo } from './site-logo';

const HEADER_ITEMS = SITE_NAVIGATION.filter((item) => item.header);

function HeaderNav({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Основная навигация" className={className}>
      <ul className="flex flex-col gap-1 lg:flex-row lg:items-center">
        {HEADER_ITEMS.map((item) => {
          const active = isSiteNavActive(item, pathname);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                onClick={onNavigate}
                className={cn(
                  'relative flex h-10 items-center rounded px-3 text-sm font-medium transition-colors duration-fast',
                  active
                    ? 'bg-primary-soft text-primary-soft-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/// Шапка публичных страниц — отдельная плавающая solid-поверхность внутри
/// области контента: отступы сверху/слева/справа, большие скругления; глубина —
/// за счёт разницы поверхностей и тени, без рамки и без backdrop-filter. Содержимое: логотип + twomc.su,
/// центральная навигация, справа — уведомления (для вошедших) и профиль.
/// На узких экранах навигация уезжает в sheet.
export function SiteHeader({ className }: { className?: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const authenticated = useAuthStore((state) => state.status === 'authenticated');

  return (
    <header
      data-testid="site-header"
      className={cn('sticky top-0 z-header px-3 pt-3 md:px-6 md:pt-4', className)}
    >
      <div
        data-testid="site-header-surface"
        className="relative mx-auto flex h-16 max-w-[1440px] items-center gap-3 rounded-xl bg-surface px-3 shadow-lg md:px-5 [&>*:not([data-testid=seasonal-decoration])]:relative [&>*:not([data-testid=seasonal-decoration])]:z-[1]"
      >
        <SeasonalHeaderDecoration />
        <IconButton
          aria-label="Открыть меню"
          variant="outline"
          className="lg:hidden"
          onClick={() => setMenuOpen(true)}
        >
          <Menu />
        </IconButton>
        <SiteLogo />
        <HeaderNav className="mx-auto hidden lg:block" />
        <div className="ml-auto flex items-center gap-1 lg:ml-0">
          <div className="lg:hidden">
            <OnlineCounter compact />
          </div>
          {authenticated ? <NotificationsPopover /> : null}
          <ProfileMenu />
        </div>
      </div>
      {/* HeaderStack: плашка — часть sticky-шапки и двигается вместе с ней. */}
      <GlobalAlertBar />

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" size="sm" aria-describedby={undefined}>
          <SheetHeader>
            <SheetTitle>
              <SiteLogo />
            </SheetTitle>
          </SheetHeader>
          <SheetBody>
            <HeaderNav onNavigate={() => setMenuOpen(false)} />
          </SheetBody>
        </SheetContent>
      </Sheet>
    </header>
  );
}
