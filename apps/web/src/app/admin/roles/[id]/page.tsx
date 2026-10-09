'use client';

import type { PermissionDto, RoleWithPermissions } from '@twomc/shared';
import { Copy, Search, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { PermissionGate } from '@/components/admin/permission-gate';
import { QueryBoundary } from '@/components/admin/query-boundary';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox, CheckboxField } from '@/components/ui/checkbox';
import { ColorPicker } from '@/components/ui/color-picker';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RolePrefix } from '@/components/ui/role-prefix';
import { SkeletonRows } from '@/components/ui/skeleton';
import { NumberStepper } from '@/components/ui/stepper';
import { SwitchField } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Timeline, TimelineItem } from '@/components/ui/timeline';
import { toast } from '@/components/ui/toast';
import { Tooltip } from '@/components/ui/tooltip';
import {
  useDeleteRole,
  usePermissionsCatalog,
  useRole,
  useRoleHistory,
  useSetRolePermissions,
  useUpdateRole,
} from '@/lib/admin/hooks';
import { permissionModuleLabel } from '@/lib/admin/permission-modules';
import { ApiError, getErrorMessage } from '@/lib/api/errors';
import { usePermissions } from '@/lib/auth/use-permissions';
import { formatDateTime, formatNumber } from '@/lib/format';

/* ---------------- Основное ---------------- */

function GeneralTab({ role }: { role: RoleWithPermissions }) {
  const { can, isSuperuser, effective } = usePermissions();
  const update = useUpdateRole(role.id);
  const [displayName, setDisplayName] = useState(role.displayName);
  const [priority, setPriority] = useState(role.priority);
  const [color, setColor] = useState<string | null>(role.color);
  const [isAssignable, setIsAssignable] = useState(role.isAssignable);

  useEffect(() => {
    setDisplayName(role.displayName);
    setPriority(role.priority);
    setColor(role.color);
    setIsAssignable(role.isAssignable);
  }, [role]);

  const editable = can('roles.edit') && !role.isSystem;
  const dirty =
    displayName !== role.displayName ||
    priority !== role.priority ||
    (color ?? '') !== (role.color ?? '') ||
    isAssignable !== role.isAssignable;
  const maxPriority = isSuperuser ? Infinity : (effective?.maxPriority ?? 0);

  const save = async () => {
    try {
      await update.mutateAsync({
        displayName: displayName.trim(),
        priority,
        color: color ?? undefined,
        isAssignable,
      });
      toast.success('Роль сохранена');
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <Card className="flex max-w-2xl flex-col gap-4">
      {role.isSystem ? (
        <p className="text-sm text-muted-foreground">
          Системная роль: имя и приоритет менять нельзя.
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Название" hint="Внутреннее имя">
          <Input value={role.name} readOnly />
        </Field>
        <Field label="Slug">
          <Input value={role.slug} readOnly className="font-mono" />
        </Field>
      </div>
      <Field label="Отображаемое имя" required>
        <Input
          value={displayName}
          disabled={!editable}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Приоритет"
          error={
            priority >= maxPriority && priority !== role.priority ? 'Выше вашего приоритета' : null
          }
        >
          <NumberStepper
            value={priority}
            onValueChange={setPriority}
            min={1}
            max={10_000}
            disabled={!editable}
          />
        </Field>
        <Field label="Цвет">
          <ColorPicker value={color} onChange={setColor} disabled={!editable} clearable />
        </Field>
      </div>
      <SwitchField
        label="Можно назначать пользователям"
        checked={isAssignable}
        onCheckedChange={setIsAssignable}
        disabled={!editable}
      />
      {editable ? (
        <div className="flex gap-2">
          <Button
            onClick={save}
            disabled={!dirty || displayName.trim().length < 2}
            loading={update.isPending}
          >
            Сохранить
          </Button>
          <Button
            variant="ghost"
            disabled={!dirty}
            onClick={() => {
              setDisplayName(role.displayName);
              setPriority(role.priority);
              setColor(role.color);
              setIsAssignable(role.isAssignable);
            }}
          >
            Сбросить
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

/* ---------------- Матрица permissions ---------------- */

function PermissionsTab({ role }: { role: RoleWithPermissions }) {
  const catalog = usePermissionsCatalog();
  const save = useSetRolePermissions(role.id);
  const initial = useMemo(
    () =>
      new Set(role.permissions.filter((p) => p.effect === 'ALLOW').map((p) => p.permission.key)),
    [role],
  );
  const denied = role.permissions.filter((p) => p.effect === 'DENY').map((p) => p.permission.key);
  const [selected, setSelected] = useState<Set<string>>(initial);
  const [query, setQuery] = useState('');
  useEffect(() => setSelected(initial), [initial]);

  const modules = useMemo(() => {
    const groups = new Map<string, PermissionDto[]>();
    const needle = query.trim().toLowerCase();
    for (const permission of catalog.data ?? []) {
      if (
        needle &&
        !permission.key.toLowerCase().includes(needle) &&
        !permission.description.toLowerCase().includes(needle)
      ) {
        continue;
      }
      (groups.get(permission.module) ??
        groups.set(permission.module, []).get(permission.module))!.push(permission);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [catalog.data, query]);

  const changed = useMemo(() => {
    let count = 0;
    for (const key of selected) if (!initial.has(key)) count += 1;
    for (const key of initial) if (!selected.has(key)) count += 1;
    return count;
  }, [selected, initial]);

  const toggle = (key: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  const toggleModule = (keys: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      keys.forEach((key) => (on ? next.add(key) : next.delete(key)));
      return next;
    });

  if (role.isSuperuser) {
    return (
      <Card>
        <p className="text-sm">
          <Badge tone="primary">superuser</Badge>{' '}
          <span className="text-muted-foreground">
            Суперпользователь получает все права автоматически — матрица не применяется.
          </span>
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-80">
          <Input
            leading={<Search />}
            placeholder="Ключ или описание"
            aria-label="Поиск по permissions"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Выбрано {formatNumber(selected.size)} из {formatNumber(catalog.data?.length ?? 0)}
          {changed > 0 ? ` · изменено ${formatNumber(changed)}` : ''}
        </p>
      </div>
      {denied.length > 0 ? (
        <Card variant="sunken" className="text-sm">
          <p className="font-medium">DENY-записи ({denied.length})</p>
          <p className="text-muted-foreground">
            Сохранение матрицы заменяет список на ALLOW-ключи — DENY будут удалены:{' '}
            <span className="font-mono text-xs">{denied.join(', ')}</span>
          </p>
        </Card>
      ) : null}

      <QueryBoundary query={catalog} skeleton={<SkeletonRows rows={8} />}>
        {() =>
          modules.length === 0 ? (
            <EmptyState size="sm" title="Ничего не найдено" />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {modules.map(([module, permissions]) => {
                const keys = permissions.map((p) => p.key);
                const checkedCount = keys.filter((k) => selected.has(k)).length;
                const all = checkedCount === keys.length;
                const some = checkedCount > 0 && !all;
                return (
                  <Card key={module} className="flex flex-col gap-2">
                    <label className="flex items-center gap-2 text-sm font-semibold">
                      <Checkbox
                        checked={all ? true : some ? 'indeterminate' : false}
                        onCheckedChange={(value) => toggleModule(keys, value === true)}
                        aria-label={`Весь модуль ${permissionModuleLabel(module)}`}
                      />
                      {permissionModuleLabel(module)}
                      <span className="ml-auto text-xs font-normal text-muted-foreground tabular">
                        {checkedCount}/{keys.length}
                      </span>
                    </label>
                    <div className="flex flex-col gap-1 border-t border-border-subtle pt-2">
                      {permissions.map((p) => (
                        <CheckboxField
                          key={p.key}
                          label={<span className="font-mono text-xs">{p.key}</span>}
                          description={p.description}
                          checked={selected.has(p.key)}
                          onCheckedChange={(value) => toggle(p.key, value === true)}
                        />
                      ))}
                    </div>
                  </Card>
                );
              })}
            </div>
          )
        }
      </QueryBoundary>

      {changed > 0 ? (
        <div className="sticky bottom-4 z-20 flex flex-wrap items-center gap-3 rounded-lg border bg-surface-raised p-3 shadow-lg">
          <p className="text-sm">
            Изменено: <span className="font-semibold tabular">{formatNumber(changed)}</span>
          </p>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={() => setSelected(initial)}>
              Сбросить
            </Button>
            <Button
              loading={save.isPending}
              onClick={async () => {
                try {
                  await save.mutateAsync([...selected]);
                  toast.success('Права роли сохранены');
                } catch (error) {
                  toast.error(getErrorMessage(error));
                }
              }}
            >
              Сохранить
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ---------------- История ---------------- */

function HistoryTab({ role }: { role: RoleWithPermissions }) {
  const history = useRoleHistory(role.id);
  return (
    <Card>
      <QueryBoundary query={history} size="sm">
        {(data) =>
          data.length === 0 ? (
            <EmptyState
              size="sm"
              title="Истории нет"
              description="Роль ещё никому не выдавалась."
            />
          ) : (
            <Timeline>
              {data.map((entry) => (
                <TimelineItem
                  key={entry.id}
                  tone={entry.action === 'GRANTED' ? 'success' : 'warning'}
                  title={entry.action === 'GRANTED' ? 'Выдана' : 'Снята'}
                  meta={
                    <span className="inline-flex flex-wrap items-center gap-1">
                      {formatDateTime(entry.createdAt)} · пользователь{' '}
                      <Link
                        href={`/admin/users/${entry.userId}`}
                        className="font-mono text-xs underline-offset-2 hover:underline"
                      >
                        {entry.userId}
                      </Link>{' '}
                      · кем <span className="font-mono text-xs">{entry.actorId}</span>
                      <Tooltip content="Скопировать id пользователя">
                        <IconButton
                          aria-label="Скопировать id пользователя"
                          size="sm"
                          onClick={() =>
                            navigator.clipboard
                              .writeText(entry.userId)
                              .then(() => toast.success('Скопировано'))
                          }
                        >
                          <Copy />
                        </IconButton>
                      </Tooltip>
                    </span>
                  }
                >
                  {entry.reason ? <p className="text-sm">{entry.reason}</p> : null}
                </TimelineItem>
              ))}
            </Timeline>
          )
        }
      </QueryBoundary>
    </Card>
  );
}

/* ---------------- Страница ---------------- */

function RoleDetails({ role }: { role: RoleWithPermissions }) {
  const router = useRouter();
  const { can } = usePermissions();
  const remove = useDeleteRole();
  const [deleting, setDeleting] = useState(false);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Роли', href: '/admin/roles' }, { label: role.displayName }]}
        title={
          <span className="inline-flex items-center gap-2">
            <RolePrefix slug={role.slug} name={role.displayName} size="sm" fallback="none" />
            {role.displayName}
          </span>
        }
        meta={
          <>
            <Badge tone="outline">приоритет {role.priority}</Badge>
            {role.isSuperuser ? <Badge tone="primary">superuser</Badge> : null}
            {role.isSystem ? <Badge tone="info">системная</Badge> : null}
            {!role.isAssignable ? <Badge>не назначается</Badge> : null}
          </>
        }
        description={<span className="font-mono text-xs">{role.slug}</span>}
        actions={
          can('roles.delete') && !role.isSystem ? (
            <Button variant="destructive-outline" onClick={() => setDeleting(true)}>
              <Trash2 />
              Удалить
            </Button>
          ) : null
        }
      />
      <Tabs defaultValue="general" variant="line">
        <TabsList aria-label="Разделы роли">
          <TabsTrigger value="general">Основное</TabsTrigger>
          {can('permissions.manage') ? (
            <TabsTrigger value="permissions" count={role.permissions.length}>
              Permissions
            </TabsTrigger>
          ) : null}
          {can('roles.history.view') ? <TabsTrigger value="history">История</TabsTrigger> : null}
        </TabsList>
        <TabsContent value="general">
          <GeneralTab role={role} />
        </TabsContent>
        <TabsContent value="permissions">
          <PermissionsTab role={role} />
        </TabsContent>
        <TabsContent value="history">
          <HistoryTab role={role} />
        </TabsContent>
      </Tabs>
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Удалить роль «${role.displayName}»?`}
        description="Роль будет снята у всех пользователей. Действие необратимо."
        confirmLabel="Удалить"
        destructive
        loading={remove.isPending}
        onConfirm={async () => {
          try {
            await remove.mutateAsync(role.id);
            toast.success('Роль удалена');
            router.replace('/admin/roles');
          } catch (error) {
            toast.error(getErrorMessage(error));
          }
        }}
      />
    </>
  );
}

export default function RolePage() {
  const { id } = useParams<{ id: string }>();
  const query = useRole(id);
  return (
    <PermissionGate requirement="roles.view">
      {query.isError && query.error instanceof ApiError && query.error.status === 404 ? (
        <div className="flex flex-col items-center gap-4">
          <ErrorState title="Роль не найдена" description="Возможно, она удалена." />
          <Button asChild variant="secondary">
            <Link href="/admin/roles">К списку ролей</Link>
          </Button>
        </div>
      ) : (
        <QueryBoundary query={query}>{(role) => <RoleDetails role={role} />}</QueryBoundary>
      )}
    </PermissionGate>
  );
}
