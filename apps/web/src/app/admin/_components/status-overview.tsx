'use client';

import type { AdminSystemOverview } from '@twomc/shared';
import { useQuery } from '@tanstack/react-query';
import { Activity, Megaphone, Power, Sparkles, Wrench, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api/client';
import type { PermissionRequirement } from '@/lib/auth/permissions';
import { usePermissions } from '@/lib/auth/use-permissions';
import { cn } from '@/lib/cn';
import { formatNumber, plural } from '@/lib/format';
import { usePublicSiteSettings } from '@/lib/site/hooks';
import { resolveSeasonalFromSettings } from '@/lib/site/seasonal';

const when = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' });

export function useSystemOverview() {
  return useQuery({
    queryKey: ['admin', 'system', 'overview'],
    queryFn: () => api.get<AdminSystemOverview>('/admin/system/overview'),
    refetchInterval: 60_000,
  });
}

function Tile({
  icon: Icon,
  label,
  value,
  note,
  tone = 'default',
  href,
  requirement,
  testId,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: 'default' | 'success' | 'warning' | 'destructive';
  href?: string;
  requirement?: PermissionRequirement;
  testId: string;
}) {
  const { can } = usePermissions();
  const body = (
    <>
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon
          aria-hidden
          className={cn(
            'size-4',
            tone === 'success' && 'text-success',
            tone === 'warning' && 'text-warning',
            tone === 'destructive' && 'text-destructive',
          )}
        />
        {label}
      </span>
      <span className="text-sm font-semibold">{value}</span>
      {note ? <span className="text-xs text-muted-foreground">{note}</span> : null}
    </>
  );
  const className = 'flex min-w-0 flex-col gap-1 rounded-xl bg-surface p-4 shadow-sm';
  return href && (!requirement || can(requirement)) ? (
    <Link href={href} data-testid={testId} className={cn(className, 'hover:bg-muted')}>
      {body}
    </Link>
  ) : (
    <div data-testid={testId} className={className}>
      {body}
    </div>
  );
}

/// Состояние проекта на дашборде (ТЗ §64–65): сезон, техработы, модули,
/// объявления, здоровье — только реальные значения с сервера.
export function StatusOverview() {
  const overview = useSystemOverview();
  const site = usePublicSiteSettings();

  if (overview.isPending) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-20 rounded-xl" />
        ))}
      </div>
    );
  }
  if (overview.isError || !overview.data) {
    return (
      <p className="text-sm text-muted-foreground" role="alert">
        Не удалось получить состояние проекта.
      </p>
    );
  }

  const data = overview.data;
  const seasonal = site.data?.seasonal;
  const campaign = seasonal
    ? resolveSeasonalFromSettings(seasonal, new Date(data.serverTime))
    : null;
  const maintenance = data.maintenance;
  const disabled = data.disabledModules.length;
  const healthy = data.health.database === 'ok' && data.health.redis === 'ok';

  return (
    <section aria-label="Состояние проекта" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Tile
        testId="overview-seasonal"
        icon={Sparkles}
        label="Сезонное оформление"
        value={campaign ? campaign.name : 'Без сезона'}
        note={seasonal && !seasonal.enabled ? 'Система выключена' : undefined}
        href="/admin/appearance"
        requirement="settings.seasonal.view"
      />
      <Tile
        testId="overview-maintenance"
        icon={Wrench}
        label="Технические работы"
        value={
          !maintenance
            ? 'Не идут'
            : maintenance.active
              ? maintenance.scope === 'full'
                ? 'Идут: весь сайт'
                : `Идут: ${formatNumber(maintenance.modules.length)} ${plural(maintenance.modules.length, { one: 'модуль', few: 'модуля', many: 'модулей' })}`
              : 'Запланированы'
        }
        note={
          maintenance && !maintenance.active && maintenance.startsAt
            ? `с ${when.format(new Date(maintenance.startsAt))}`
            : undefined
        }
        tone={maintenance?.active ? 'warning' : 'default'}
        href="/admin/system?tab=maintenance"
        requirement="system.maintenance.view"
      />
      <Tile
        testId="overview-modules"
        icon={Power}
        label="Модули"
        value={disabled === 0 ? 'Все работают' : `Выключено: ${formatNumber(disabled)}`}
        tone={disabled > 0 ? 'warning' : 'success'}
        href="/admin/system?tab=modules"
        requirement="system.modules.view"
      />
      <Tile
        testId="overview-announcements"
        icon={Megaphone}
        label="Объявления"
        value={
          data.activeAnnouncements === 0
            ? 'Нет активных'
            : `${formatNumber(data.activeAnnouncements)} ${plural(data.activeAnnouncements, { one: 'активное', few: 'активных', many: 'активных' })}`
        }
        href="/admin/announcements"
        requirement="announcements.view"
      />
      <Tile
        testId="overview-health"
        icon={Activity}
        label="Здоровье системы"
        value={healthy ? 'Всё в порядке' : 'Есть проблемы'}
        note={`База данных: ${data.health.database === 'ok' ? 'ок' : 'ошибка'} · Redis: ${data.health.redis === 'ok' ? 'ок' : 'ошибка'}`}
        tone={healthy ? 'success' : 'destructive'}
      />
    </section>
  );
}
