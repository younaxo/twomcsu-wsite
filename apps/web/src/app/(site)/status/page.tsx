'use client';

import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/admin/page-header';
import { overviewHealth } from '@/components/shell/server-status-button';
import { StatusBadge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api/client';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import { useServersOverview } from '@/lib/site/hooks';
import { ModuleGate } from '@/components/system/site-availability';

const HEALTH_LABEL = {
  operational: { text: 'Все системы работают', dot: 'bg-success' },
  degraded: { text: 'Частичные неполадки', dot: 'bg-warning' },
  outage: { text: 'Серьёзный сбой', dot: 'bg-destructive' },
  unknown: { text: 'Нет данных', dot: 'bg-border-strong' },
} as const;

/// Временная внутренняя status page (до отдельного проекта
/// twomcsu-statuspagewebsite — NEXT_PUBLIC_STATUS_PAGE_URL): API и сервера
/// по реальным проверкам.
function StatusPageContent() {
  const overview = useServersOverview();
  const apiHealth = useQuery({
    queryKey: ['site', 'health'],
    queryFn: () => api.get<{ status?: string }>('/health', { auth: false }),
    refetchInterval: 60_000,
  });
  const health = overviewHealth(overview.data, overview.isError);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 md:px-6">
      <PageHeader
        title="Статус серверов"
        description="Текущее состояние сайта и игровых серверов twomc.su."
      />
      <Card className="flex items-center gap-3">
        <span aria-hidden className={cn('size-3 rounded-full', HEALTH_LABEL[health].dot)} />
        <p className="text-lg font-semibold">{HEALTH_LABEL[health].text}</p>
      </Card>
      <Card flush>
        <ul className="divide-y divide-border-subtle">
          <li className="flex items-center justify-between px-4 py-3 text-sm">
            <span>API сайта</span>
            {apiHealth.isPending ? (
              <Skeleton className="h-5 w-20" />
            ) : (
              <StatusBadge status={apiHealth.isSuccess ? 'online' : 'blocked'}>
                {apiHealth.isSuccess ? 'Работает' : 'Недоступен'}
              </StatusBadge>
            )}
          </li>
          {overview.data?.servers.map((server) => (
            <li key={server.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <span>
                {server.name}
                <span className="ml-2 text-xs text-muted-foreground tabular">
                  {formatNumber(server.playerCount)} / {formatNumber(server.maxPlayers)}
                </span>
              </span>
              <StatusBadge status={server.online ? 'online' : 'offline'} />
            </li>
          ))}
          {overview.isPending ? (
            <li className="px-4 py-3">
              <Skeleton className="h-5 w-40" />
            </li>
          ) : null}
        </ul>
      </Card>
    </div>
  );
}

/// Страница модуля «minecraft» (ADR-0082): выключен или на техработах — понятное состояние.
export default function StatusPage() {
  return (
    <ModuleGate module="minecraft">
      <StatusPageContent />
    </ModuleGate>
  );
}
