'use client';

import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';
import { STATUS_PAGE_URL } from '@/lib/site/config';
import { useServersOverview } from '@/lib/site/hooks';

export type ServiceHealth = 'operational' | 'degraded' | 'outage' | 'unknown';

/// Сводная оценка по реальному ping серверов: все онлайн — зелёный, часть —
/// жёлтый, ни одного (или API недоступен) — красный, нет данных — серый.
export function overviewHealth(
  data: { totalServers: number; onlineServers: number } | undefined,
  isError: boolean,
): ServiceHealth {
  if (isError) {
    return 'outage';
  }
  if (!data) {
    return 'unknown';
  }
  if (data.totalServers === 0) {
    return 'unknown';
  }
  if (data.onlineServers === data.totalServers) {
    return 'operational';
  }
  return data.onlineServers === 0 ? 'outage' : 'degraded';
}

const HEALTH: Record<ServiceHealth, { label: string; dot: string }> = {
  operational: { label: 'Все системы работают', dot: 'bg-success' },
  degraded: { label: 'Частичные неполадки', dot: 'bg-warning' },
  outage: { label: 'Серьёзный сбой', dot: 'bg-destructive' },
  unknown: { label: 'Статус неизвестен', dot: 'bg-border-strong' },
};

/// Кнопка «Статус серверов» → публичная status page (отдельный проект;
/// пока URL не задан — внутренний /status).
export function ServerStatusButton({ className }: { className?: string }) {
  const overview = useServersOverview();
  const health = overviewHealth(overview.data, overview.isError);
  const external = /^https?:\/\//.test(STATUS_PAGE_URL);
  const content = (
    <>
      <span aria-hidden className={cn('size-2 rounded-full', HEALTH[health].dot)} />
      Статус серверов
      {external ? <ExternalLink aria-hidden className="size-3.5 text-subtle-foreground" /> : null}
    </>
  );
  const classes = cn(
    'inline-flex h-control-sm items-center gap-2 rounded border bg-surface px-3 text-sm hover:bg-muted',
    className,
  );
  return (
    <Tooltip content={HEALTH[health].label}>
      {external ? (
        <a
          href={STATUS_PAGE_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Статус серверов: ${HEALTH[health].label}`}
          data-health={health}
          className={classes}
        >
          {content}
        </a>
      ) : (
        <Link
          href={STATUS_PAGE_URL}
          aria-label={`Статус серверов: ${HEALTH[health].label}`}
          data-health={health}
          className={classes}
        >
          {content}
        </Link>
      )}
    </Tooltip>
  );
}
