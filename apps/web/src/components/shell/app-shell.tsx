'use client';

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';
import { AnnouncementBanners } from '@/components/announcements/announcement-banners';
import { MaintenanceScreen, StaffBypassNotice } from '@/components/system/site-availability';
import { cn } from '@/lib/cn';
import { useFullMaintenance } from '@/lib/site/status';
import { DocumentBadge } from './document-badge';
import { GlobalFloatingActions } from './floating-actions';
import { MobileNav } from './mobile-nav';
import { RAIL_OFFSET_CLASS, SidebarRail } from './sidebar-rail';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';

/// Сезонные эффекты — отдельный чанк только на клиенте (ADR-0079).
const SeasonalEffects = dynamic(
  () => import('@/components/seasonal/seasonal-effects').then((m) => m.SeasonalEffects),
  { ssr: false },
);

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
  // Полные техработы (ADR-0082): игрокам — экран техработ вместо сайта,
  // сотрудникам с правом обхода — сайт с плашкой. Вход и админка — вне AppShell.
  const maintenance = useFullMaintenance();
  if (maintenance.active && !maintenance.bypass) {
    return <MaintenanceScreen maintenance={maintenance.maintenance} />;
  }
  return (
    <div className={cn('min-h-dvh bg-background text-foreground', className)}>
      <DocumentBadge />
      <SidebarRail />
      <div className={cn('flex min-h-dvh flex-col', RAIL_OFFSET_CLASS)}>
        <SiteHeader />
        <AnnouncementBanners className="mx-auto w-full max-w-[1440px] px-3 pt-3 md:px-6" />
        <main id="main" className="flex-1">
          {maintenance.bypass ? (
            <div className="px-3 pt-3">
              <StaffBypassNotice reason="MAINTENANCE" />
            </div>
          ) : null}
          {children}
        </main>
        <SiteFooter />
      </div>
      <GlobalFloatingActions />
      <MobileNav />
      <SeasonalEffects />
    </div>
  );
}
