'use client';

import type { ReportType } from '@twomc/shared';
import { PageSection, StatCard, StatGrid } from '@/components/admin/page-header';
import { QueryBoundary } from '@/components/admin/query-boundary';
import { Skeleton } from '@/components/ui/skeleton';
import { STAFF_REPORT_TYPE_LABEL, useReportsStats } from '@/lib/admin/reports';
import { formatNumber } from '@/lib/format';
import { REPORT_STATUS_LABEL, type ReportStatus } from '@/lib/support/hooks';

/// Статистика обращений (`reports.stats`): всего, по статусам и по типам.
/// Полосы — на CSS, число всегда продублировано текстом. Показываются только
/// категории, по которым есть обращения (так отдаёт API).

function Bars({
  label,
  rows,
}: {
  label: string;
  rows: Array<{ key: string; name: string; count: number }>;
}) {
  const max = Math.max(...rows.map((row) => row.count), 0);
  return (
    <ul className="flex flex-col gap-3" aria-label={label}>
      {rows.map((row) => (
        <li key={row.key} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{row.name}</span>
            <span className="tabular shrink-0 font-medium">{formatNumber(row.count)}</span>
          </div>
          <div aria-hidden className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${max > 0 ? Math.max((row.count / max) * 100, 2) : 0}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ReportsStatsPanel() {
  const query = useReportsStats();
  return (
    <div data-testid="reports-stats">
      <QueryBoundary
        query={query}
        skeleton={
          <StatGrid>
            <StatCard label={<Skeleton className="h-4 w-24" />} value={null} loading />
          </StatGrid>
        }
      >
        {(data) => {
          const statuses = (Object.keys(REPORT_STATUS_LABEL) as ReportStatus[])
            .map((key) => ({ key, name: REPORT_STATUS_LABEL[key], count: data.byStatus[key] ?? 0 }))
            .filter((row) => row.count > 0);
          const types = (Object.keys(data.byType) as ReportType[])
            .map((key) => ({
              key,
              name: STAFF_REPORT_TYPE_LABEL[key] ?? key,
              count: data.byType[key] ?? 0,
            }))
            .filter((row) => row.count > 0)
            .sort((a, b) => b.count - a.count);
          return (
            <div className="flex flex-col gap-6">
              <StatGrid>
                <StatCard label="Всего обращений" value={data.total} tone="primary" />
                <StatCard label="Ожидают" value={data.byStatus.PENDING ?? 0} tone="warning" />
                <StatCard label="На рассмотрении" value={data.byStatus.IN_REVIEW ?? 0} />
              </StatGrid>
              {data.total === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Обращений пока нет.
                </p>
              ) : (
                <div className="grid gap-6 xl:grid-cols-2">
                  <PageSection title="По статусам">
                    <div className="rounded-xl bg-surface p-5 shadow-sm">
                      <Bars label="Обращения по статусам" rows={statuses} />
                    </div>
                  </PageSection>
                  <PageSection title="По типам">
                    <div className="rounded-xl bg-surface p-5 shadow-sm">
                      <Bars label="Обращения по типам" rows={types} />
                    </div>
                  </PageSection>
                </div>
              )}
            </div>
          );
        }}
      </QueryBoundary>
    </div>
  );
}
