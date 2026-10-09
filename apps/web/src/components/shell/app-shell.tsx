'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { DocumentBadge } from './document-badge';
import { GlobalFloatingActions } from './floating-actions';
import { MobileNav } from './mobile-nav';
import { RAIL_OFFSET_CLASS, SidebarRail } from './sidebar-rail';
import { SiteFooter } from './site-footer';
import { GlobalAlertBar } from './global-alert-bar';
import { SiteHeader } from './site-header';

/// Глобальная оболочка публичных страниц twomc.su:
///
///   │ rail │   ┌──────────── header ────────────┐
///   │fixed │   └────────────────────────────────┘
///   │      │   main (flex-1)
///   │      │   ╭──────────── footer ────────────╮
///   │      │   │                                │
///   ───────────┴────────────────────────────────┴── низ страницы
///
/// Rail фиксирован на всю высоту и не двигается при скролле. Header —
/// плавающая solid-поверхность (отступы, скругления, без border/glass).
/// Footer — скруглённая сверху поверхность с боковыми отступами, которая
/// касается низа страницы: колонка min-h-dvh, main растягивается, после
/// футера ничего нет (на короткой странице он прижат к низу viewport,
/// на длинной — после контента, в обычном потоке документа). На мобильных
/// rail заменяет нижняя навигация; плавающие действия — над ней.
export function AppShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('min-h-dvh bg-background text-foreground', className)}>
      <DocumentBadge />
      <SidebarRail />
      <div className={cn('flex min-h-dvh flex-col', RAIL_OFFSET_CLASS)}>
        <SiteHeader />
        {/* Глобальная плашка (ADR-0066): часть layout, сразу под шапкой. */}
        <GlobalAlertBar />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
      </div>
      <GlobalFloatingActions />
      <MobileNav />
    </div>
  );
}
