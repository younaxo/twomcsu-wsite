'use client';

import type { AdminUserListItem, BulkUserAction } from '@twomc/shared';
import { Ban, Download, Ellipsis, Search, ShieldCheck, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { Can, PermissionGate } from '@/components/admin/permission-gate';
import { Avatar } from '@/components/ui/avatar';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { DataGrid, type DataGridColumn } from '@/components/ui/data-grid';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { downloadExport } from '@/lib/admin/api';
import { useUsers } from '@/lib/admin/hooks';
import { getErrorMessage } from '@/lib/api/errors';
import { usePermissions } from '@/lib/auth/use-permissions';
import { formatDate, formatNumber, formatRelative, plural } from '@/lib/format';
import { BanDialog } from './_components/ban-dialog';

function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function userStatus(user: AdminUserListItem) {
  if (user.isBanned) {
    return <StatusBadge status="blocked">Забанен</StatusBadge>;
  }
  if (!user.isVerified) {
    return <StatusBadge status="pending">Не подтверждён</StatusBadge>;
  }
  return <StatusBadge status="active">Активен</StatusBadge>;
}

interface BanTarget {
  action: BulkUserAction;
  ids: string[];
  label?: string;
}

export default function UsersPage() {
  const router = useRouter();
  const { can } = usePermissions();
  const [query, setQuery] = useState('');
  const q = useDebounced(query.trim());
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [banTarget, setBanTarget] = useState<BanTarget | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => setPage(1), [q]);

  const params = useMemo(() => ({ page, limit, q: q || undefined }), [page, limit, q]);
  const users = useUsers(params);
  const canBulk = can('users.bulk.edit');

  const columns: DataGridColumn<AdminUserListItem>[] = [
    {
      key: 'user',
      header: 'Пользователь',
      cell: (user) => (
        <div className="flex items-center gap-3">
          <Avatar name={user.username} size="sm" shape="round" />
          <div className="min-w-0">
            <p className="truncate font-medium">{user.username}</p>
            <p className="truncate font-mono text-xs text-subtle-foreground">{user.tag}</p>
          </div>
        </div>
      ),
    },
    { key: 'email', header: 'E-mail', hideOnMobile: true, truncate: true, cell: (u) => u.email },
    {
      key: 'position',
      header: 'Должность',
      cell: (user) => (
        <Badge color={user.position?.color ?? null}>{user.position?.displayName ?? '—'}</Badge>
      ),
    },
    { key: 'status', header: 'Статус', cell: userStatus },
    {
      key: 'lastLogin',
      header: 'Последний вход',
      hideOnMobile: true,
      cell: (user) => (user.lastLoginAt ? formatRelative(user.lastLoginAt) : '—'),
    },
    {
      key: 'created',
      header: 'Регистрация',
      hideOnMobile: true,
      cell: (u) => formatDate(u.createdAt),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Действия</span>,
      align: 'right',
      cell: (user) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              aria-label={`Действия: ${user.username}`}
              size="sm"
              onClick={(e) => e.stopPropagation()}
            >
              <Ellipsis />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onSelect={() => router.push(`/admin/users/${user.id}`)}>
              <UserRound />
              Открыть карточку
            </DropdownMenuItem>
            {canBulk ? (
              <>
                <DropdownMenuSeparator />
                {user.isBanned ? (
                  <DropdownMenuItem
                    onSelect={() =>
                      setBanTarget({ action: 'UNBAN', ids: [user.id], label: user.username })
                    }
                  >
                    <ShieldCheck />
                    Разбанить
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() =>
                      setBanTarget({ action: 'BAN', ids: [user.id], label: user.username })
                    }
                  >
                    <Ban />
                    Забанить…
                  </DropdownMenuItem>
                )}
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadExport('users', { q: q || undefined });
      toast.success('CSV сформирован');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setExporting(false);
    }
  };

  const total = users.data?.total ?? 0;

  return (
    <PermissionGate requirement="users.view">
      <PageHeader
        title="Пользователи"
        breadcrumbs={[{ label: 'Пользователи' }]}
        description={
          users.data
            ? `${formatNumber(total)} ${plural(total, { one: 'аккаунт', few: 'аккаунта', many: 'аккаунтов' })}`
            : undefined
        }
        actions={
          <Can requirement="users.export">
            <Button variant="secondary" loading={exporting} onClick={exportCsv}>
              <Download />
              Экспорт CSV
            </Button>
          </Can>
        }
      />

      <DataGrid
        columns={columns}
        rows={users.data?.items ?? []}
        getRowId={(user) => user.id}
        loading={users.isPending}
        error={users.isError ? users.error : undefined}
        onRetry={() => users.refetch()}
        onRowClick={(user) => router.push(`/admin/users/${user.id}`)}
        selection={canBulk ? { selected, onChange: setSelected } : undefined}
        bulkActions={
          canBulk ? (
            <>
              <Button
                variant="destructive-outline"
                onClick={() => setBanTarget({ action: 'BAN', ids: [...selected] })}
              >
                <Ban />
                Забанить выбранных
              </Button>
              <Button
                variant="secondary"
                onClick={() => setBanTarget({ action: 'UNBAN', ids: [...selected] })}
              >
                <ShieldCheck />
                Разбанить
              </Button>
            </>
          ) : undefined
        }
        toolbar={
          <div className="w-full sm:w-80">
            <Input
              leading={<Search />}
              placeholder="Ник, e-mail или tag"
              aria-label="Поиск пользователей"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        }
        pagination={{
          page,
          limit,
          total,
          onPageChange: setPage,
          onLimitChange: (next) => {
            setLimit(next);
            setPage(1);
          },
        }}
        emptyTitle="Никого не нашли"
        emptyDescription={q ? 'Измените запрос.' : 'Пользователей пока нет.'}
        caption="Пользователи сайта: ник, e-mail, должность, статус, последний вход и дата регистрации"
      />

      {banTarget ? (
        <BanDialog
          open
          onOpenChange={(open) => (open ? null : setBanTarget(null))}
          action={banTarget.action}
          userIds={banTarget.ids}
          label={banTarget.label}
          onDone={() => setSelected(new Set())}
        />
      ) : null}
    </PermissionGate>
  );
}
