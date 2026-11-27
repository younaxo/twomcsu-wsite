'use client';

import { LogIn, Menu, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Button, IconButton } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/cn';
import { isSiteNavActive, SITE_NAVIGATION } from '@/lib/site/config';
import { useAuthStore } from '@/lib/auth/store';
import { resolveShellHref, useShellMode } from '@/lib/site/shell-mode';
import { GlobalAlertBar } from './global-alert-bar';
import { NotificationsPopover } from './notifications-popover';
import { OnlineCounter } from './sidebar-rail';
import { ProfileMenu } from './profile-menu';
import { SeasonalHeaderDecoration } from './seasonal-header-decoration';
import { SiteLogo } from './site-logo';
import { SoonItem } from './soon-item';

const HEADER_ITEMS = SITE_NAVIGATION.filter((item) => item.header);

function HeaderNav({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { mainSiteUrl } = useShellMode();
  return (
    <nav aria-label="Основная навигация" className={className}>
      <ul className="flex flex-col gap-1 lg:flex-row lg:items-center">
        {HEADER_ITEMS.map((item) => {
          // На сайте розыгрыша ссылки ведут на основной сайт: активного пункта нет.
          const active = mainSiteUrl === null && isSiteNavActive(item, pathname);
          const itemClassName = cn(
            'relative flex h-10 items-center rounded px-3 text-sm font-medium transition-colors duration-fast',
            active
              ? 'bg-primary-soft text-primary-soft-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          );
          if (item.available === false) {
            return (
              <li key={item.href}>
                <SoonItem className="flex h-10 items-center px-3 text-sm font-medium">
                  {item.label}
                </SoonItem>
              </li>
            );
          }
          return (
            <li key={item.href}>
              {mainSiteUrl !== null ? (
                <a
                  href={resolveShellHref(mainSiteUrl, item.href)}
                  onClick={onNavigate}
                  className={itemClassName}
                >
                  {item.label}
                </a>
              ) : (
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  onClick={onNavigate}
                  className={itemClassName}
                >
                  {item.label}
                </Link>
              )}
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
  const { mainSiteUrl } = useShellMode();
  const authenticated = useAuthStore((state) => state.status === 'authenticated');

  return (
    <header
      data-testid="site-header"
      className={cn('sticky top-0 z-header px-3 pt-3 md:px-6 md:pt-4', className)}
    >
      <div
        data-testid="site-header-surface"
        className="relative mx-auto flex h-16 max-w-[1440px] items-center gap-2 md:gap-3 rounded-xl bg-surface px-3 shadow-lg md:px-5 [&>*:not([data-testid=seasonal-decoration])]:relative [&>*:not([data-testid=seasonal-decoration])]:z-[1]"
      >
        <SeasonalHeaderDecoration />
        {mainSiteUrl === null ? (
          <IconButton
            aria-label="Открыть меню"
            variant="outline"
            className="lg:hidden"
            onClick={() => setMenuOpen(true)}
          >
            <Menu />
          </IconButton>
        ) : null}
        <SiteLogo />
        {mainSiteUrl === null ? <HeaderNav className="mx-auto hidden lg:block" /> : null}
        <div className="ml-auto flex shrink-0 items-center gap-1 lg:ml-0">
          {/* На телефонах уже 440 px счётчик онлайна не помещается рядом
              с логотипом и действиями — скрываем его, а не сжимаем логотип. */}
          {mainSiteUrl !== null ? (
            // Сайт розыгрыша: онлайн, уведомления и профиль требуют API основного
            // сайта; вход пока недоступен: неактивная кнопка с подсказкой «Скоро»
            // (hover и фокус с клавиатуры), без перехода.
            <Tooltip content="Скоро">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                aria-disabled="true"
                data-testid="login-soon"
                className="cursor-not-allowed opacity-60 hover:bg-secondary"
                onClick={(event) => event.preventDefault()}
              >
                <LogIn />
                Войти
              </Button>
            </Tooltip>
          ) : (
            <>
              <div className="max-[439px]:hidden lg:hidden">
                <OnlineCounter compact />
              </div>
              <Button asChild variant="ghost" size="icon">
                <Link href="/players" aria-label="Поиск игроков" data-testid="players-link">
                  <Search />
                </Link>
              </Button>
              {authenticated ? <NotificationsPopover /> : null}
              <ProfileMenu />
            </>
          )}
        </div>
      </div>
      {/* HeaderStack: плашка — часть sticky-шапки и двигается вместе с ней. */}
      <GlobalAlertBar />

      {mainSiteUrl === null ? (
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
      ) : null}
    </header>
  );
}
