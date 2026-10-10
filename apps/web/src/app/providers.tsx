'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { ExternalLinkGuard } from '@/components/shell/external-link-guard';
import { SiteContextMenu } from '@/components/shell/site-context-menu';
import { ConnectivityMonitor } from '@/components/system/connectivity-monitor';
import { ServiceWorkerRegistration } from '@/components/system/service-worker';
import { Toaster } from '@/components/ui/toast';
import { TooltipProvider } from '@/components/ui/tooltip';
import { createQueryClient } from '@/lib/query/client';
import { ThemeProvider } from '@/lib/theme/theme-provider';

/// Провайдеры приложения — монтируются один раз в корневом layout:
/// тема (dark-first), TanStack Query, Tooltip (общая задержка), подтверждение
/// переходов на сторонние сайты (ExternalLinkGuard), собственное контекстное
/// меню (SiteContextMenu, ADR-0077), Toaster, монитор связи и Service Worker
/// (ADR-0086).
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={400} skipDelayDuration={300}>
          <ExternalLinkGuard>
            <SiteContextMenu>{children}</SiteContextMenu>
          </ExternalLinkGuard>
          <Toaster />
          <ConnectivityMonitor />
          <ServiceWorkerRegistration />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
