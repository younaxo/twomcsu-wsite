'use client';

import type { ReportPriority, ReportType } from '@twomc/shared';
import { REPORT_PRIORITIES, REPORT_TYPES } from '@twomc/shared';
import { LifeBuoy, Lock, Search } from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { PermissionGate } from '@/components/admin/permission-gate';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Input, inputClassName } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { SkeletonRows } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  EMPTY_STAFF_FILTER,
  REPORT_PRIORITY_LABEL,
  REPORT_PRIORITY_TONE,
  REPORT_SEARCH_MAX,
  STAFF_REPORT_TYPE_LABEL,
  useArchivedReports,
  useStaffReports,
  type StaffReportSummary,
  type StaffReportsFilter,
} from '@/lib/admin/reports';
import { usePermissions } from '@/lib/auth/use-permissions';
import { formatDateTime } from '@/lib/format';
import { REPORT_STATUS_LABEL, type ReportStatus } from '@/lib/support/hooks';

/// Очередь обращений для персонала (Этап 01, шаг C): фильтры по статусу, типу,
/// приоритету и ответственному, поиск, переход в карточку; архив — отдельная
/// вкладка (`reports.archived.view`).

type AssigneeMode = '' | 'me' | 'unassigned' | 'id';

function modeOf(value: string): AssigneeMode {
  return value === '' || value === 'me' || value === 'unassigned' ? value : 'id';
}

function Filters({
  filter,
  onChange,
}: {
  filter: StaffReportsFilter;
  onChange: (next: StaffReportsFilter) => void;
}) {
  const [q, setQ] = useState(filter.q);
  const [mode, setMode] = useState<AssigneeMode>(modeOf(filter.assignedToId));
  const [assigneeId, setAssigneeId] = useState(mode === 'id' ? filter.assignedToId : '');
  const apply = (event: FormEvent) => {
    event.preventDefault();
    onChange({
      ...filter,
      q: q.trim(),
      assignedToId: mode === 'id' ? assigneeId.trim() : mode,
      page: 1,
    });
  };
  return (
    <div className="flex flex-col gap-2" data-testid="reports-filters">
      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Статус"
          className={`${inputClassName} w-auto`}
          value={filter.status}
          onChange={(event) =>
            onChange({ ...filter, status: event.target.value as ReportStatus | '', page: 1 })
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
          onChange={(event) =>
            onChange({ ...filter, type: event.target.value as ReportType | '', page: 1 })
          }
        >
          <option value="">Все типы</option>
          {REPORT_TYPES.map((type) => (
            <option key={type} value={type}>
              {STAFF_REPORT_TYPE_LABEL[type]}
            </option>
          ))}
        </select>
        <select
          aria-label="Приоритет"
          className={`${inputClassName} w-auto`}
          value={filter.priority}
          onChange={(event) =>
            onChange({ ...filter, priority: event.target.value as ReportPriority | '', page: 1 })
          }
        >
          <option value="">Любой приоритет</option>
          {REPORT_PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {REPORT_PRIORITY_LABEL[priority]}
            </option>
          ))}
        </select>
        <select
          aria-label="Ответственный"
          className={`${inputClassName} w-auto`}
          value={mode}
          onChange={(event) => {
            const next = event.target.value as AssigneeMode;
            setMode(next);
            // «По ID» применяется кнопкой «Найти» вместе с введённым ID.
            if (next !== 'id') onChange({ ...filter, assignedToId: next, page: 1 });
          }}
        >
          <option value="">Любой ответственный</option>
          <option value="me">Назначено мне</option>
          <option value="unassigned">Не назначено</option>
          <option value="id">По ID пользователя…</option>
        </select>
      </div>
      <form className="flex flex-wrap gap-2" role="search" onSubmit={apply}>
        <Input
          aria-label="Поиск"
          placeholder="Номер, описание, ник автора или цели"
          className="w-full min-w-0 sm:w-80"
          maxLength={REPORT_SEARCH_MAX}
          value={q}
          onChange={(event) => setQ(event.target.value)}
        />
        {mode === 'id' ? (
          <Input
            aria-label="ID ответственного"
            placeholder="ID пользователя"
            className="w-full min-w-0 sm:w-56"
            maxLength={64}
            value={assigneeId}
            onChange={(event) => setAssigneeId(event.target.value)}
          />
        ) : null}
        <Button type="submit" size="sm" variant="secondary">
          <Search />
          Найти
        </Button>
      </form>
    </div>
  );
}

function ReportRow({ report }: { report: StaffReportSummary }) {
  return (
    <li>
      <Link
        href={`/admin/reports/${encodeURIComponent(report.reportNumber)}`}
        className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-muted/40"
      >
        <span className="font-mono text-xs text-muted-foreground">#{report.reportNumber}</span>
        <span className="text-sm font-medium">
          {STAFF_REPORT_TYPE_LABEL[report.type] ?? report.type}
        </span>
        <Badge tone={report.status === 'PENDING' ? 'warning' : 'neutral'}>
          {REPORT_STATUS_LABEL[report.status]}
        </Badge>
        {report.priority ? (
          <Badge tone={REPORT_PRIORITY_TONE[report.priority]} data-testid="report-priority">
            {REPORT_PRIORITY_LABEL[report.priority]}
          </Badge>
        ) : null}
        {report.isLocked ? <Lock aria-label="Заблокировано" className="size-3.5" /> : null}
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {report.author?.username ?? '—'}
          {report.assignedTo ? ` → ${report.assignedTo.username}` : ' · не назначено'}
        </span>
        <span className="text-xs text-subtle-foreground">{formatDateTime(report.createdAt)}</span>
      </Link>
    </li>
  );
}

function ReportList({
  archived,
  emptyTitle,
  testId,
}: {
  archived: boolean;
  emptyTitle: string;
  testId: string;
}) {
  const [filter, setFilter] = useState<StaffReportsFilter>(EMPTY_STAFF_FILTER);
  const queue = useStaffReports(filter, !archived);
  const archive = useArchivedReports(filter, archived);
  const reports = archived ? archive : queue;
  const totalPages = reports.data
    ? Math.max(1, Math.ceil(reports.data.total / reports.data.limit))
    : 1;
  return (
    <div className="flex flex-col gap-4">
      <Filters filter={filter} onChange={setFilter} />
      {reports.isPending ? (
        <SkeletonRows rows={6} />
      ) : reports.isError ? (
        <ErrorState error={reports.error} onRetry={() => reports.refetch()} />
      ) : reports.data.items.length === 0 ? (
        <EmptyState
          icon={<LifeBuoy />}
          title={emptyTitle}
          description="По этим фильтрам ничего не найдено."
        />
      ) : (
        <>
          <ul
            className="flex flex-col divide-y divide-border-subtle rounded-xl bg-surface shadow-sm"
            data-testid={testId}
          >
            {reports.data.items.map((report) => (
              <ReportRow key={report.id} report={report} />
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

function Sections() {
  const { can } = usePermissions();
  const queue = <ReportList archived={false} emptyTitle="Обращений нет" testId="staff-reports" />;
  if (!can('reports.archived.view')) return queue;
  return (
    <Tabs defaultValue="queue">
      <TabsList>
        <TabsTrigger value="queue">Очередь</TabsTrigger>
        <TabsTrigger value="archive">Архив</TabsTrigger>
      </TabsList>
      <TabsContent value="queue" className="pt-4">
        {queue}
      </TabsContent>
      <TabsContent value="archive" className="pt-4">
        <ReportList archived emptyTitle="Архив пуст" testId="archived-reports" />
      </TabsContent>
    </Tabs>
  );
}

export default function AdminReportsPage() {
  return (
    <PermissionGate requirement="reports.view">
      <PageHeader title="Обращения" description="Жалобы, обжалования и вопросы игроков." />
      <Sections />
    </PermissionGate>
  );
}
