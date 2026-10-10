'use client';

import { AUDIT_LOG_SEVERITIES, type AuditLogEntry, type AuditLogSeverity } from '@twomc/shared';
import { Download, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { PageHeader, StatCard, StatGrid } from '@/components/admin/page-header';
import { Can, PermissionGate } from '@/components/admin/permission-gate';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataGrid, type DataGridColumn } from '@/components/ui/data-grid';
import { DatePicker, type IsoDate } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { QuickView } from '@/components/ui/quick-view';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/toast';
import { downloadExport } from '@/lib/admin/api';
import { useAuditLog, useAuditStats } from '@/lib/admin/hooks';
import { getErrorMessage } from '@/lib/api/errors';
import { usePermissions } from '@/lib/auth/use-permissions';
import { formatDateTime, formatNumber } from '@/lib/format';
import { DescriptionItem, DescriptionList } from '@/components/admin/page-header';
import { UserIdentity } from '@/components/ui/user-identity';

const SEVERITY_TONE: Record<AuditLogSeverity, 'neutral' | 'warning' | 'destructive'> = {
  info: 'neutral',
  warning: 'warning',
  critical: 'destructive',
};
const SEVERITY_LABEL: Record<AuditLogSeverity, string> = {
  info: 'Инфо',
  warning: 'Внимание',
  critical: 'Критично',
};

function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

const toIso = (date: IsoDate | null, end = false) =>
  date ? new Date(`${date}T${end ? '23:59:59' : '00:00:00'}`).toISOString() : undefined;

export default function AuditLogPage() {
  const { can } = usePermissions();
  const [query, setQuery] = useState('');
  const q = useDebounced(query.trim());
  const [severity, setSeverity] = useState<'all' | AuditLogSeverity>('all');
  const [from, setFrom] = useState<IsoDate | null>(null);
  const [to, setTo] = useState<IsoDate | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [selected, setSelected] = useState<AuditLogEntry | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => setPage(1), [q, severity, from, to]);

  const params = useMemo(
    () => ({
      page,
      limit,
      q: q || undefined,
      severity: severity === 'all' ? undefined : severity,
      from: toIso(from),
      to: toIso(to, true),
    }),
    [page, limit, q, severity, from, to],
  );
  const log = useAuditLog(params);
  const stats = useAuditStats(can('audit_log.stats'));

  const columns: DataGridColumn<AuditLogEntry>[] = [
    { key: 'time', header: 'Время', width: 150, cell: (e) => formatDateTime(e.createdAt) },
    {
      key: 'action',
      header: 'Действие',
      cell: (e) => <span className="font-mono text-xs">{e.action}</span>,
    },
    {
      key: 'actor',
      header: 'Кто',
      cell: (e) => <UserIdentity username={e.actor.username} previewable />,
    },
    {
      key: 'target',
      header: 'Объект',
      hideOnMobile: true,
      cell: (e) =>
        e.targetType ? (
          <span className="font-mono text-xs">
            {e.targetType}
            {e.targetId ? ` · ${e.targetId.slice(0, 8)}…` : ''}
          </span>
        ) : (
          '—'
        ),
    },
    {
      key: 'severity',
      header: 'Уровень',
      cell: (e) => <Badge tone={SEVERITY_TONE[e.severity]}>{SEVERITY_LABEL[e.severity]}</Badge>,
    },
    {
      key: 'ip',
      header: 'IP',
      hideOnMobile: true,
      cell: (e) => <span className="font-mono text-xs">{e.ipAddress ?? '—'}</span>,
    },
  ];

  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadExport('audit', {
        severity: severity === 'all' ? undefined : severity,
        dateFrom: toIso(from),
        dateTo: toIso(to, true),
      });
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setExporting(false);
    }
  };

  return (
    <PermissionGate requirement={['audit_log.view', 'audit_log.stats']}>
      <PageHeader
        title="Журнал аудита"
        breadcrumbs={[{ label: 'Журнал аудита' }]}
        description="Все действия администраторов: кто, что, когда и откуда."
        actions={
          <Can requirement="audit_log.export">
            <Button variant="secondary" loading={exporting} onClick={exportCsv}>
              <Download />
              Экспорт CSV
            </Button>
          </Can>
        }
      />

      {can('audit_log.stats') ? (
        <StatGrid>
          <StatCard label="Всего записей" value={stats.data?.total} loading={stats.isPending} />
          <StatCard label="За 24 часа" value={stats.data?.last24h} loading={stats.isPending} />
          <StatCard
            label="Критичных"
            value={stats.data?.bySeverity.critical ?? 0}
            tone={(stats.data?.bySeverity.critical ?? 0) > 0 ? 'destructive' : 'default'}
            loading={stats.isPending}
          />
          <StatCard
            label="Частое действие"
            value={stats.data?.topActions[0]?.action ?? '—'}
            format={false}
            note={
              stats.data?.topActions[0]
                ? `${formatNumber(stats.data.topActions[0].count)} раз`
                : undefined
            }
            loading={stats.isPending}
            className="[&_p:nth-child(2)]:truncate [&_p:nth-child(2)]:font-mono [&_p:nth-child(2)]:text-lg"
          />
        </StatGrid>
      ) : null}

      <Can requirement="audit_log.view">
        <DataGrid
          columns={columns}
          rows={log.data?.items ?? []}
          getRowId={(e) => e.id}
          loading={log.isPending}
          error={log.isError ? log.error : undefined}
          onRetry={() => log.refetch()}
          onRowClick={setSelected}
          toolbar={
            <>
              <div className="w-full sm:w-72">
                <Input
                  leading={<Search />}
                  placeholder="Действие, объект, ник"
                  aria-label="Поиск по журналу"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <Select value={severity} onValueChange={(v) => setSeverity(v as typeof severity)}>
                <SelectTrigger aria-label="Уровень" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все уровни</SelectItem>
                  {AUDIT_LOG_SEVERITIES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {SEVERITY_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <DatePicker
                value={from}
                onChange={setFrom}
                placeholder="С даты"
                aria-label="С даты"
              />
              <DatePicker value={to} onChange={setTo} placeholder="По дату" aria-label="По дату" />
            </>
          }
          pagination={{
            page,
            limit,
            total: log.data?.total ?? 0,
            onPageChange: setPage,
            onLimitChange: (next) => {
              setLimit(next);
              setPage(1);
            },
          }}
          emptyTitle="Записей нет"
          emptyDescription="Измените фильтры или период."
          caption="Журнал аудита: время, действие, актор, объект, уровень, IP"
        />
      </Can>

      <QuickView
        open={selected !== null}
        onOpenChange={(open) => (open ? null : setSelected(null))}
        title={selected?.action ?? ''}
        subtitle={selected ? formatDateTime(selected.createdAt) : undefined}
        meta={
          selected ? (
            <Badge tone={SEVERITY_TONE[selected.severity]}>
              {SEVERITY_LABEL[selected.severity]}
            </Badge>
          ) : null
        }
      >
        {selected ? (
          <div className="flex flex-col gap-4">
            <DescriptionList>
              <DescriptionItem term="Кто">{selected.actor.username}</DescriptionItem>
              <DescriptionItem term="ID актора" mono>
                {selected.actorId}
              </DescriptionItem>
              <DescriptionItem term="Объект" mono>
                {selected.targetType ?? '—'} {selected.targetId ?? ''}
              </DescriptionItem>
              <DescriptionItem term="IP" mono>
                {selected.ipAddress ?? '—'}
              </DescriptionItem>
              <DescriptionItem term="User-Agent" className="sm:col-span-2">
                <span className="break-all text-xs">{selected.userAgent ?? '—'}</span>
              </DescriptionItem>
              <DescriptionItem term="Длительность">
                {selected.duration !== null ? `${formatNumber(selected.duration)} мс` : '—'}
              </DescriptionItem>
            </DescriptionList>
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Изменения</p>
              <pre className="max-h-80 overflow-auto rounded border bg-surface-sunken p-3 font-mono text-xs scrollbar-thin">
                {selected.changes ? JSON.stringify(selected.changes, null, 2) : '—'}
              </pre>
            </div>
          </div>
        ) : null}
      </QuickView>
    </PermissionGate>
  );
}
