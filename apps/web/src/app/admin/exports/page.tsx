'use client';

import { NEWS_STATUSES, ORDER_STATUSES, REPORT_STATUSES, type PermissionKey } from '@twomc/shared';
import { Download } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { PermissionGate } from '@/components/admin/permission-gate';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DatePicker, type IsoDate } from '@/components/ui/date-picker';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/toast';
import { downloadExport, type ExportKind } from '@/lib/admin/api';
import { getErrorMessage } from '@/lib/api/errors';
import { usePermissions } from '@/lib/auth/use-permissions';

const toIso = (date: IsoDate | null, end = false) =>
  date ? new Date(`${date}T${end ? '23:59:59' : '00:00:00'}`).toISOString() : undefined;

interface ExportCardProps {
  kind: ExportKind;
  title: string;
  description: string;
  permission: PermissionKey;
  /// Фильтр по статусу: список значений + подписи.
  statuses?: readonly string[];
  /// Текстовый фильтр (users: q).
  search?: boolean;
}

const EXPORTS: ExportCardProps[] = [
  {
    kind: 'users',
    title: 'Пользователи',
    description: 'Ник, e-mail, статус, даты. Фильтр по строке поиска и датам регистрации.',
    permission: 'users.export',
    search: true,
  },
  {
    kind: 'orders',
    title: 'Заказы',
    description: 'Все заказы магазина с суммами и статусами.',
    permission: 'orders.export',
    statuses: ORDER_STATUSES,
  },
  {
    kind: 'finance',
    title: 'Финансы',
    description: 'Транзакции для бухгалтерии (тот же формат, права финансов).',
    permission: 'finance.export',
    statuses: ORDER_STATUSES,
  },
  {
    kind: 'reports',
    title: 'Обращения',
    description: 'Тикеты и жалобы по статусу и периоду.',
    permission: 'reports.export',
    statuses: REPORT_STATUSES,
  },
  {
    kind: 'news',
    title: 'Новости',
    description: 'Публикации по статусу и периоду.',
    permission: 'news.export',
    statuses: NEWS_STATUSES,
  },
  {
    kind: 'audit',
    title: 'Журнал аудита',
    description: 'Действия администраторов за период.',
    permission: 'audit_log.export',
  },
];

function ExportCard({ kind, title, description, statuses, search }: ExportCardProps) {
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState<IsoDate | null>(null);
  const [to, setTo] = useState<IsoDate | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const body: Record<string, unknown> = { dateFrom: toIso(from), dateTo: toIso(to, true) };
      if (statuses && status !== 'all') body.status = status;
      if (search && q.trim()) body.q = q.trim();
      await downloadExport(kind, body as never);
      toast.success(`${title}: CSV скачан`);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {search ? (
        <Field label="Поиск">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ник или e-mail" />
        </Field>
      ) : null}
      {statuses ? (
        <Field label="Статус">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все</SelectItem>
              {statuses.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="С даты">
          <DatePicker value={from} onChange={setFrom} clearable />
        </Field>
        <Field label="По дату">
          <DatePicker value={to} onChange={setTo} clearable />
        </Field>
      </div>
      <div className="mt-auto">
        <Button variant="secondary" loading={loading} onClick={run}>
          <Download />
          Скачать CSV
        </Button>
      </div>
    </Card>
  );
}

const ALL_EXPORT_PERMISSIONS: PermissionKey[] = EXPORTS.map((e) => e.permission);

export default function ExportsPage() {
  const { can } = usePermissions();
  const visible = EXPORTS.filter((e) => can(e.permission));
  let content: ReactNode;
  if (visible.length === 0) {
    content = null;
  } else {
    content = (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((e) => (
          <ExportCard key={e.kind} {...e} />
        ))}
      </div>
    );
  }
  return (
    <PermissionGate requirement={ALL_EXPORT_PERMISSIONS}>
      <PageHeader
        title="Экспорт CSV"
        breadcrumbs={[{ label: 'Экспорт CSV' }]}
        description="Выгрузки формируются сервером и скачиваются сразу. Кодировка UTF-8."
      />
      {content}
    </PermissionGate>
  );
}
