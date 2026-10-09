'use client';

import type { RoleDto } from '@twomc/shared';
import { Ellipsis, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { Can, PermissionGate } from '@/components/admin/permission-gate';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { DataGrid, type DataGridColumn, type DataGridSort } from '@/components/ui/data-grid';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { RolePrefix } from '@/components/ui/role-prefix';
import { toast } from '@/components/ui/toast';
import { useDeleteRole, useRoles } from '@/lib/admin/hooks';
import { getErrorMessage } from '@/lib/api/errors';
import { usePermissions } from '@/lib/auth/use-permissions';
import { formatDate, formatNumber, plural } from '@/lib/format';
import { RoleFormDialog } from './_components/role-form-dialog';

function compare(a: RoleDto, b: RoleDto, sort: DataGridSort | null): number {
  const dir = sort?.direction === 'asc' ? 1 : -1;
  switch (sort?.key) {
    case 'role':
      return a.displayName.localeCompare(b.displayName, 'ru') * dir;
    case 'created':
      return (a.createdAt < b.createdAt ? -1 : 1) * dir;
    default:
      return (a.priority - b.priority) * dir;
  }
}

export default function RolesPage() {
  const router = useRouter();
  const { can } = usePermissions();
  const roles = useRoles();
  const remove = useDeleteRole();
  const [sort, setSort] = useState<DataGridSort | null>({ key: 'priority', direction: 'desc' });
  const [createOpen, setCreateOpen] = useState(false);
  const [deleting, setDeleting] = useState<RoleDto | null>(null);

  const rows = [...(roles.data ?? [])].sort((a, b) => compare(a, b, sort));
  const canDelete = can('roles.delete');

  const columns: DataGridColumn<RoleDto>[] = [
    {
      key: 'role',
      header: 'Роль',
      sortable: true,
      cell: (role) => (
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-full border border-border"
            style={{ backgroundColor: role.color ?? 'transparent' }}
          />
          <RolePrefix slug={role.slug} name={role.displayName} size="xs" fallback="none" />
          <span className="font-medium">{role.displayName}</span>
        </span>
      ),
    },
    {
      key: 'slug',
      header: 'Slug',
      hideOnMobile: true,
      cell: (r) => <span className="font-mono text-xs">{r.slug}</span>,
    },
    {
      key: 'priority',
      header: 'Приоритет',
      sortable: true,
      align: 'right',
      cell: (r) => r.priority,
    },
    {
      key: 'flags',
      header: 'Флаги',
      cell: (role) => (
        <span className="flex flex-wrap gap-1">
          {role.isSuperuser ? <Badge tone="primary">superuser</Badge> : null}
          {role.isSystem ? <Badge tone="info">системная</Badge> : null}
          {!role.isAssignable ? <Badge>не назначается</Badge> : null}
        </span>
      ),
    },
    {
      key: 'created',
      header: 'Создана',
      sortable: true,
      hideOnMobile: true,
      cell: (r) => formatDate(r.createdAt),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Действия</span>,
      align: 'right',
      cell: (role) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              aria-label={`Действия: ${role.displayName}`}
              size="sm"
              onClick={(e) => e.stopPropagation()}
            >
              <Ellipsis />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onSelect={() => router.push(`/admin/roles/${role.id}`)}>
              Открыть
            </DropdownMenuItem>
            {canDelete ? (
              <DropdownMenuItem
                variant="destructive"
                disabled={role.isSystem}
                onSelect={() => setDeleting(role)}
              >
                <Trash2 />
                Удалить…
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const total = roles.data?.length ?? 0;

  return (
    <PermissionGate requirement="roles.view">
      <PageHeader
        title="Роли"
        breadcrumbs={[{ label: 'Роли' }]}
        description={
          roles.data
            ? `${formatNumber(total)} ${plural(total, { one: 'роль', few: 'роли', many: 'ролей' })} · иерархия по приоритету`
            : undefined
        }
        actions={
          <Can requirement="roles.create">
            <Button onClick={() => setCreateOpen(true)}>
              <Plus />
              Создать роль
            </Button>
          </Can>
        }
      />

      <DataGrid
        columns={columns}
        rows={rows}
        getRowId={(role) => role.id}
        sort={sort}
        onSortChange={setSort}
        loading={roles.isPending}
        error={roles.isError ? roles.error : undefined}
        onRetry={() => roles.refetch()}
        onRowClick={(role) => router.push(`/admin/roles/${role.id}`)}
        emptyTitle="Ролей нет"
        caption="Роли проекта: название, slug, приоритет, флаги, дата создания"
      />

      <RoleFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => router.push(`/admin/roles/${id}`)}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => (open ? null : setDeleting(null))}
        title={`Удалить роль «${deleting?.displayName ?? ''}»?`}
        description="Роль будет снята у всех пользователей. Действие необратимо."
        confirmLabel="Удалить"
        destructive
        loading={remove.isPending}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await remove.mutateAsync(deleting.id);
            toast.success('Роль удалена');
            setDeleting(null);
          } catch (error) {
            toast.error(getErrorMessage(error));
          }
        }}
      />
    </PermissionGate>
  );
}
