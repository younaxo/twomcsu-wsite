'use client';

import { LifeBuoy, Lock } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { PermissionGate } from '@/components/admin/permission-gate';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { inputClassName } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { SkeletonRows } from '@/components/ui/skeleton';
import {
  STAFF_REPORT_TYPE_LABEL,
  useStaffReports,
  type StaffReportsFilter,
} from '@/lib/admin/reports';
import { formatDateTime } from '@/lib/format';
import { REPORT_STATUS_LABEL, type ReportStatus } from '@/lib/support/hooks';

/// Очередь обращений для персонала (срез 7.3, ADR-0128): фильтры по статусу и
/// типу, назначенный модератор, переход в карточку.

function Queue() {
  const [filter, setFilter] = useState<StaffReportsFilter>({ status: '', type: '', page: 1 });
  const reports = useStaffReports(filter);
  const totalPages = reports.data
    ? Math.max(1, Math.ceil(reports.data.total / reports.data.limit))
    : 1;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" data-testid="reports-filters">
        <select
          aria-label="Статус"
          className={`${inputClassName} w-auto`}
          value={filter.status}
          onChange={(event) =>
            setFilter({ ...filter, status: event.target.value as ReportStatus | '', page: 1 })
          }
        >
          <option value="">Все статусы</option>
          {(Object.keys(REPORT_STATUS_LABEL) as ReportStatus[]).map((status) => (
            <option key={status} value={status}>
              {REPORT_STATUS_LABEL[status]}
            </option>
          ))}
        </select>
        <select
          aria-label="Тип"
          className={`${inputClassName} w-auto`}
          value={filter.type}
          onChange={(event) => setFilter({ ...filter, type: event.target.value, page: 1 })}
        >
          <option value="">Все типы</option>
          {Object.entries(STAFF_REPORT_TYPE_LABEL).map(([type, label]) => (
            <option key={type} value={type}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {reports.isPending ? (
        <SkeletonRows rows={6} />
      ) : reports.isError ? (
        <ErrorState error={reports.error} onRetry={() => reports.refetch()} />
      ) : reports.data.items.length === 0 ? (
        <EmptyState
          icon={<LifeBuoy />}
          title="Обращений нет"
          description="По этим фильтрам очередь пуста."
        />
      ) : (
        <>
          <ul
            className="flex flex-col divide-y divide-border-subtle rounded-xl bg-surface shadow-sm"
            data-testid="staff-reports"
          >
            {reports.data.items.map((report) => (
              <li key={report.id}>
                <Link
                  href={`/admin/reports/${encodeURIComponent(report.reportNumber)}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-muted/40"
                >
                  <span className="font-mono text-xs text-muted-foreground">
                    #{report.reportNumber}
                  </span>
                  <span className="text-sm font-medium">
                    {STAFF_REPORT_TYPE_LABEL[report.type] ?? report.type}
                  </span>
                  <Badge tone={report.status === 'PENDING' ? 'warning' : 'neutral'}>
                    {REPORT_STATUS_LABEL[report.status]}
                  </Badge>
                  {report.isLocked ? (
                    <Lock aria-label="Заблокировано" className="size-3.5" />
                  ) : null}
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {report.author?.username ?? '—'}
                    {report.assignedTo ? ` → ${report.assignedTo.username}` : ' · не назначено'}
                  </span>
                  <span className="text-xs text-subtle-foreground">
                    {formatDateTime(report.createdAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {totalPages > 1 ? (
            <Pagination
              page={filter.page}
              totalPages={totalPages}
              onPageChange={(page) => setFilter({ ...filter, page })}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

export default function AdminReportsPage() {
  return (
    <PermissionGate requirement="reports.view">
      <PageHeader title="Обращения" description="Жалобы, обжалования и вопросы игроков." />
      <Queue />
    </PermissionGate>
  );
}
