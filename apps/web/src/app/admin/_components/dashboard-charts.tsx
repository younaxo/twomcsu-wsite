'use client';

import { useState } from 'react';
import { TimeSeriesChart } from '@/components/charts/time-series-chart';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Skeleton } from '@/components/ui/skeleton';
import { useDashboardTimeseries } from '@/lib/admin/hooks';

const RANGES = [
  { value: '7', label: '7 дней' },
  { value: '30', label: '30 дней' },
  { value: '90', label: '90 дней' },
];

/// Графики дашборда (ADR-0078): реальные ряды `GET /admin/dashboard/timeseries`.
export function DashboardCharts() {
  const [range, setRange] = useState('30');
  const query = useDashboardTimeseries(Number(range));
  const data = query.data?.series ?? [];

  const island = 'flex flex-col gap-3 rounded-xl bg-surface p-5 shadow-sm';
  const body = (chart: React.ReactNode) =>
    query.isPending ? (
      <Skeleton className="h-[220px] w-full" />
    ) : query.isError ? (
      <p className="py-10 text-center text-sm text-muted-foreground" role="alert">
        Не удалось загрузить данные графика.
      </p>
    ) : (
      chart
    );

  return (
    <section className="flex flex-col gap-4" aria-label="Динамика за период">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Динамика</h2>
        <SegmentedControl size="sm" value={range} onValueChange={setRange} options={RANGES} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className={island}>
          <p className="text-sm font-medium">Регистрации по дням</p>
          {body(
            <TimeSeriesChart
              ariaLabel="Регистрации по дням"
              data={data}
              series={[
                { key: 'registrations', label: 'Регистрации', color: 'rgb(var(--primary))' },
              ]}
            />,
          )}
        </div>
        <div className={island}>
          <p className="text-sm font-medium">Жалобы и действия в аудите</p>
          {body(
            <TimeSeriesChart
              ariaLabel="Новые жалобы и действия в журнале аудита по дням"
              data={data}
              series={[
                { key: 'reports', label: 'Новые жалобы', color: 'rgb(var(--warning))' },
                { key: 'auditActions', label: 'Действия в аудите', color: 'rgb(var(--info))' },
              ]}
            />,
          )}
        </div>
      </div>
    </section>
  );
}
