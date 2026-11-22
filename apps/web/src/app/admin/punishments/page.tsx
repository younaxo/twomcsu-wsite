'use client';

import { Eye, EyeOff, Gavel, Search } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { PermissionGate } from '@/components/admin/permission-gate';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState, ForbiddenState } from '@/components/ui/error-state';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { SkeletonRows } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api/errors';
import {
  ADMIN_KIND_LABELS,
  ADMIN_NAME_PATTERN,
  ADMIN_STATUS_LABELS,
  useAdminPunishments,
  type AdminPunishmentFilters,
  type AdminPunishmentRow,
} from '@/lib/admin/punishments';
import { formatDateTime } from '@/lib/format';

/// Наказания сервера в админке (право `users.punishments`, 2FA проверяет API).
/// Q31: IP и контакты не показываются, выдавший скрыт по умолчанию и
/// раскрывается явным действием в строке; принудительно скрытый (Q63) — не раскрывается.

const KIND_OPTIONS = [
  { value: 'ALL', label: 'Все' },
  { value: 'BAN', label: ADMIN_KIND_LABELS.BAN },
  { value: 'MUTE', label: ADMIN_KIND_LABELS.MUTE },
  { value: 'WARN', label: 'Предупр.' },
  { value: 'KICK', label: ADMIN_KIND_LABELS.KICK },
];

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'Все' },
  { value: 'ACTIVE', label: ADMIN_STATUS_LABELS.ACTIVE },
  { value: 'EXPIRED', label: ADMIN_STATUS_LABELS.EXPIRED },
  { value: 'REMOVED', label: ADMIN_STATUS_LABELS.REMOVED },
];

const STATUS_TONE = {
  ACTIVE: 'destructive',
  EXPIRED: 'neutral',
  REMOVED: 'success',
  DELETED_AT_SOURCE: 'warning',
} as const;

function durationText(row: AdminPunishmentRow): string {
  if (row.permanent) return 'Навсегда';
  if (row.until) return `до ${formatDateTime(row.until)}`;
  return 'Без срока';
}

function PunishmentRow({ row }: { row: AdminPunishmentRow }) {
  const [shown, setShown] = useState(false);
  return (
    <li data-testid="punishment-row" className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Badge tone="outline">{ADMIN_KIND_LABELS[row.kind]}</Badge>
        <Badge tone={STATUS_TONE[row.status]}>{ADMIN_STATUS_LABELS[row.status]}</Badge>
        {row.ipBan ? <Badge tone="warning">По адресу</Badge> : null}
        {row.silent ? <Badge>Тихо</Badge> : null}
        <span className="text-sm font-medium">{row.subjectName ?? 'Игрок не указан'}</span>
        <span className="font-mono text-xs text-subtle-foreground">{row.ref}</span>
      </div>
      <p className="text-sm text-muted-foreground">
        {row.reasonMasked ? 'Причина скрыта' : (row.reason ?? 'Причина не указана')}
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-subtle-foreground">
        <span>Выдано {formatDateTime(row.startedAt)}</span>
        <span>{durationText(row)}</span>
        {row.removedAt ? <span>Снято {formatDateTime(row.removedAt)}</span> : null}
        <span className="inline-flex items-center gap-1.5">
          Выдал:{' '}
          {row.issuerHidden ? (
            <span>скрыт</span>
          ) : shown ? (
            <span data-testid="issuer-name" className="text-foreground">
              {row.executor ?? 'не указан'}
            </span>
          ) : (
            <span aria-hidden>•••</span>
          )}
          {row.issuerHidden ? null : (
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={shown}
              onClick={() => setShown((value) => !value)}
            >
              {shown ? <EyeOff /> : <Eye />}
              {shown ? 'Скрыть' : 'Показать выдавшего'}
            </Button>
          )}
        </span>
      </div>
    </li>
  );
}

function List({ filters }: { filters: AdminPunishmentFilters }) {
  const query = useAdminPunishments(filters);
  if (query.isPending) return <SkeletonRows rows={5} />;
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 403) {
      return (
        <ForbiddenState
          title="Недостаточно прав"
          description="Нужно право «Наказания игроков» и подтверждённая двухфакторная защита."
        />
      );
    }
    return (
      <ErrorState error={query.error} onRetry={() => query.refetch()} retrying={query.isFetching} />
    );
  }
  const rows = query.data.pages.flatMap((page) => page.items);
  const stale = query.data.pages.some((page) => page.stale);
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Gavel />}
        title="Наказаний не найдено"
        description="Измените фильтры или проверьте синхронизацию с игровым сервером."
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {stale ? (
        <p role="status" className="rounded-lg bg-warning-soft px-4 py-2 text-sm text-warning">
          Данные источника давно не обновлялись: список может отставать от игры.
        </p>
      ) : null}
      <ul
        className="flex flex-col divide-y divide-border-subtle rounded-xl bg-surface shadow-sm"
        data-testid="punishments"
      >
        {rows.map((row) => (
          <PunishmentRow key={row.ref} row={row} />
        ))}
      </ul>
      {query.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            loading={query.isFetchingNextPage}
            onClick={() => query.fetchNextPage()}
          >
            Показать ещё
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function PunishmentsContent() {
  const [filters, setFilters] = useState<AdminPunishmentFilters>({
    kind: 'ALL',
    status: 'ALL',
    name: '',
  });
  const [draft, setDraft] = useState('');
  const [invalid, setInvalid] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = draft.trim();
    if (value && !ADMIN_NAME_PATTERN.test(value)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setFilters((current) => ({ ...current, name: value }));
  };

  return (
    <>
      <PageHeader
        title="Наказания"
        breadcrumbs={[{ label: 'Люди и доступ' }, { label: 'Наказания' }]}
        description="Баны, муты, предупреждения и кики с игрового сервера. IP и контакты не показываются."
      />
      <div className="flex flex-col gap-3">
        <form onSubmit={submit} className="flex flex-wrap items-start gap-2" role="search">
          <div className="flex min-w-0 flex-1 basis-56 flex-col gap-1">
            <Input
              aria-label="Ник игрока"
              placeholder="Ник игрока (от 3 символов)"
              value={draft}
              maxLength={16}
              invalid={invalid}
              leading={<Search aria-hidden className="size-4" />}
              onChange={(event) => setDraft(event.target.value)}
            />
            {invalid ? (
              <p role="alert" className="text-xs text-destructive">
                Ник: 3–16 символов, латиница, цифры, «_» и «.».
              </p>
            ) : null}
          </div>
          <Button type="submit" variant="secondary">
            Найти
          </Button>
        </form>
        <div className="flex flex-wrap gap-3">
          <SegmentedControl
            aria-label="Тип наказания"
            size="sm"
            options={KIND_OPTIONS}
            value={filters.kind}
            onValueChange={(value) =>
              setFilters((current) => ({
                ...current,
                kind: value as AdminPunishmentFilters['kind'],
              }))
            }
          />
          <SegmentedControl
            aria-label="Статус"
            size="sm"
            options={STATUS_OPTIONS}
            value={filters.status}
            onValueChange={(value) =>
              setFilters((current) => ({
                ...current,
                status: value as AdminPunishmentFilters['status'],
              }))
            }
          />
        </div>
      </div>
      <List filters={filters} />
    </>
  );
}

export default function AdminPunishmentsPage() {
  return (
    <PermissionGate requirement="users.punishments">
      <PunishmentsContent />
    </PermissionGate>
  );
}
