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
import { NotificationsPopover } from './notifications-popover';
import { OnlineCounter } from './sidebar-rail';
import { ProfileMenu } from './profile-menu';
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
                    ? 'text-foreground after:absolute after:inset-x-3 after:-bottom-px after:hidden after:h-0.5 after:rounded-full after:bg-primary lg:after:block'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  active && 'bg-primary-soft/60 lg:bg-transparent',
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

/// Единая шапка публичных страниц: логотип + twomc.su, центральная
/// навигация, справа — уведомления (для вошедших) и профиль. На узких
/// экранах навигация уезжает в sheet, колокольчик и аватар остаются.
export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const authenticated = useAuthStore((state) => state.status === 'authenticated');

  return (
    <header className="sticky top-0 z-header border-b bg-surface">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-3 px-4 md:px-6">
        <IconButton
          aria-label="Открыть меню"
          variant="outline"
          className="lg:hidden"
          onClick={() => setMenuOpen(true)}
        >
          <Menu />
        </IconButton>
        <SiteLogo />
        <HeaderNav className="ml-6 hidden lg:block" />
        <div className="ml-auto flex items-center gap-1">
          <div className="lg:hidden">
            <OnlineCounter compact />
          </div>
          {authenticated ? <NotificationsPopover /> : null}
          <ProfileMenu />
        </div>
      </div>

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
