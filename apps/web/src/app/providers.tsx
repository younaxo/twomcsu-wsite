'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { GlassFilterDefs } from '@/components/ui/glass';
import { Toaster } from '@/components/ui/toast';
import { TooltipProvider } from '@/components/ui/tooltip';
import { createQueryClient } from '@/lib/query/client';
import { ThemeProvider } from '@/lib/theme/theme-provider';

/// Провайдеры приложения — монтируются один раз в корневом layout:
/// тема (dark-first), TanStack Query, Tooltip (общая задержка), Toaster.
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={400} skipDelayDuration={300}>
          {children}
          <Toaster />
          <GlassFilterDefs />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
