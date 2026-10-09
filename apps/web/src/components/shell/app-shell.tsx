'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { GlobalFloatingActions } from './floating-actions';
import { MobileNav } from './mobile-nav';
import { RAIL_OFFSET_CLASS, SidebarRail } from './sidebar-rail';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';

/// Глобальная оболочка публичных страниц twomc.su:
///
///   ┌──────┬──────────────────────────┐
///   │ rail │ header                   │
///   │ fixed├──────────────────────────┤
///   │      │ main (scroll)            │
///   │      ├──────────────────────────┤
///   │      │ footer                   │
///   └──────┴──────────────────────────┘
///
/// Rail фиксирован на всю высоту, header/main/footer — в области контента
/// (отступ слева под rail на desktop). На мобильных rail заменяет нижняя
/// навигация. Overlays (popover/sheet/toast) — порталы на body.
export function AppShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('min-h-dvh bg-background text-foreground', className)}>
      <SidebarRail />
      <div className={cn('flex min-h-dvh flex-col', RAIL_OFFSET_CLASS)}>
        <SiteHeader />
        <main id="main" className="flex-1 pb-20 lg:pb-0">
          {children}
        </main>
        <SiteFooter className="max-lg:pb-16" />
      </div>
      <GlobalFloatingActions />
      <MobileNav />
    </div>
  );
}
