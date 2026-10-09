'use client';

import { Flag, Newspaper, Users } from 'lucide-react';
import { PageHeader, PageSection, StatCard, StatGrid } from '@/components/admin/page-header';
import { PermissionGate } from '@/components/admin/permission-gate';
import { QueryBoundary } from '@/components/admin/query-boundary';
import { DataGrid, type DataGridColumn } from '@/components/ui/data-grid';
import { Skeleton } from '@/components/ui/skeleton';
import { useContentDashboard } from '@/lib/admin/hooks';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';

const NEWS_STATUS: Record<string, string> = {
  DRAFT: 'Черновики',
  SCHEDULED: 'Запланированы',
  PUBLISHED: 'Опубликованы',
  ARCHIVED: 'В архиве',
};

interface StatusRow {
  key: string;
  label: string;
  count: number;
  /// Итоговая строка «Всего» — выделяется жирным.
  total?: boolean;
}

function StatusTable({
  title,
  rows,
  labels,
}: {
  title: string;
  rows: Record<string, number>;
  labels?: Record<string, string>;
}) {
  const entries = Object.entries(rows);
  const total = entries.reduce((sum, [, n]) => sum + n, 0);
  /// Пустой набор → empty state DataGrid; иначе статусы + строка «Всего».
  const data: StatusRow[] =
    entries.length === 0
      ? []
      : [
          ...entries.map(([status, n]) => ({
            key: status,
            label: labels?.[status] ?? status,
            count: n,
          })),
          { key: '__total', label: 'Всего', count: total, total: true },
        ];
  const columns: DataGridColumn<StatusRow>[] = [
    {
      key: 'status',
      header: title,
      cell: (row) => <span className={cn(row.total && 'font-medium')}>{row.label}</span>,
    },
    {
      key: 'count',
      header: 'Кол-во',
      align: 'right',
      cell: (row) => (
        <span className={cn(row.total && 'font-medium')}>{formatNumber(row.count)}</span>
      ),
    },
  ];
  return (
    <DataGrid
      columns={columns}
      rows={data}
      getRowId={(row) => row.key}
      emptyTitle="Пока пусто"
      caption={`${title}: статус и количество, последняя строка — итог`}
    />
  );
}

export default function ContentPage() {
  const query = useContentDashboard();
  return (
    <PermissionGate requirement="content.view">
      <PageHeader
        title="Контент"
        breadcrumbs={[{ label: 'Контент' }]}
        description="Сводка по новостям, формам и очереди жалоб. Полные разделы контента — следующая фаза."
      />
      <QueryBoundary
        query={query}
        skeleton={
          <StatGrid>
            {Array.from({ length: 4 }, (_, i) => (
              <StatCard key={i} label={<Skeleton className="h-4 w-24" />} value={null} loading />
            ))}
          </StatGrid>
        }
      >
        {(data) => {
          const pending =
            data.pendingCommentReports + data.pendingProfileReports + data.pendingTicketReports;
          return (
            <>
              <StatGrid>
                <StatCard
                  label="Жалоб в очереди"
                  value={pending}
                  icon={<Flag />}
                  tone={pending > 0 ? 'warning' : 'default'}
                  note={`${formatNumber(data.pendingCommentReports)} комм. · ${formatNumber(data.pendingProfileReports)} проф. · ${formatNumber(data.pendingTicketReports)} тикеты`}
                />
                <StatCard
                  label="Новостей"
                  value={Object.values(data.news).reduce((a, b) => a + b, 0)}
                  icon={<Newspaper />}
                />
                <StatCard label="Пользователей" value={data.totalUsers} icon={<Users />} />
                <StatCard
                  label="Забанено"
                  value={data.bannedUsers}
                  tone={data.bannedUsers > 0 ? 'destructive' : 'default'}
                />
              </StatGrid>
              <PageSection title="По статусам">
                <div className="grid gap-4 lg:grid-cols-2">
                  <StatusTable title="Новости" rows={data.news} labels={NEWS_STATUS} />
                  <StatusTable title="Формы" rows={data.forms} />
                </div>
              </PageSection>
            </>
          );
        }}
      </QueryBoundary>
    </PermissionGate>
  );
}
