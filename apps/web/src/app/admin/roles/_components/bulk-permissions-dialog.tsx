'use client';

import type { PermissionDto, RoleDto } from '@twomc/shared';
import { Minus, Plus, Replace, ShieldAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { MultiSelect } from '@/components/ui/multi-select';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { useBulkRolePermissions, usePermissionsCatalog, useRoleDetails } from '@/lib/admin/hooks';
import { ApiError, getErrorMessage } from '@/lib/api/errors';
import { useAuthStore } from '@/lib/auth/store';
import { formatNumber, plural } from '@/lib/format';

type Mode = 'add' | 'remove' | 'replace';

const MODE_HINT: Record<Mode, string> = {
  add: 'Права будут добавлены всем выбранным ролям; остальные права ролей не меняются.',
  remove: 'Права будут убраны у всех выбранных ролей; остальные права не меняются.',
  replace:
    'Набор прав каждой выбранной роли будет ЗАМЕНЁН указанным списком. Требует отдельного подтверждения.',
};

/// Причина, по которой роль нельзя менять (зеркало проверок backend — он
/// источник правды и всё равно отклонит операцию целиком).
function protectionReason(
  role: RoleDto,
  actor: { superuser: boolean; maxPriority: number | null },
): string | null {
  if (role.isSuperuser) return 'роль с полным доступом — права не редактируются';
  if (role.isSystem && !actor.superuser) return 'системная роль — только superuser';
  if (!actor.superuser && role.priority >= (actor.maxPriority ?? -Infinity)) {
    return 'priority не ниже вашего';
  }
  return null;
}

function blockedFromError(error: unknown): string[] {
  if (error instanceof ApiError && error.body && typeof error.body === 'object') {
    const blocked = (error.body as { blocked?: unknown }).blocked;
    if (Array.isArray(blocked)) return blocked.map(String);
  }
  return [];
}

/// Массовое изменение прав ролей (ADR-0068): ADD / REMOVE по умолчанию,
/// REPLACE — с дополнительным подтверждением. Предпросмотр по каждой роли.
export function BulkPermissionsDialog({
  roles,
  open,
  onOpenChange,
  onDone,
}: {
  roles: RoleDto[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const actor = useAuthStore((state) => state.user?.permissions) ?? {
    superuser: false,
    permissions: [],
    maxPriority: null,
  };
  const catalog = usePermissionsCatalog(open);
  const details = useRoleDetails(
    roles.map((role) => role.id),
    open,
  );
  const mutation = useBulkRolePermissions();
  const [mode, setMode] = useState<Mode>('add');
  const [keys, setKeys] = useState<string[]>([]);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [serverBlocked, setServerBlocked] = useState<string[]>([]);

  const byId = useMemo(
    () => new Map((catalog.data ?? []).map((p: PermissionDto) => [p.id, p.key])),
    [catalog.data],
  );
  const options = useMemo(
    () =>
      (catalog.data ?? [])
        // Выдать можно только свои права (backend проверит то же самое).
        .filter((p) => mode === 'remove' || actor.superuser || actor.permissions.includes(p.key))
        .map((p) => ({
          value: p.key,
          label: p.key,
          description: p.description,
          keywords: [p.module, p.description],
        })),
    [catalog.data, mode, actor.superuser, actor.permissions],
  );

  const protectedRoles = roles
    .map((role) => ({ role, reason: protectionReason(role, actor) }))
    .filter((entry) => entry.reason !== null);

  const loadingDetails = details.some((query) => query.isPending) || catalog.isPending;
  const preview = roles.map((role, index) => {
    const detail = details[index]?.data;
    const current = new Set(
      (detail?.permissions ?? []).map((rp) => byId.get(rp.permissionId)).filter(Boolean),
    ) as Set<string>;
    const target =
      mode === 'replace'
        ? new Set(keys)
        : mode === 'add'
          ? new Set([...current, ...keys])
          : new Set([...current].filter((key) => !keys.includes(key)));
    return {
      role,
      added: [...target].filter((key) => !current.has(key)),
      removed: [...current].filter((key) => !target.has(key)),
    };
  });
  const changesTotal = preview.reduce((sum, p) => sum + p.added.length + p.removed.length, 0);
  const canApply =
    protectedRoles.length === 0 &&
    !loadingDetails &&
    (mode === 'replace' || keys.length > 0) &&
    changesTotal > 0;

  const apply = async () => {
    setServerBlocked([]);
    try {
      const result = await mutation.mutateAsync({
        roleIds: roles.map((role) => role.id),
        ...(mode === 'add' ? { add: keys } : {}),
        ...(mode === 'remove' ? { remove: keys } : {}),
        ...(mode === 'replace' ? { replace: keys, confirmReplace: true } : {}),
      });
      const changed = result.updated.filter((r) => r.added.length + r.removed.length > 0).length;
      toast.success(
        `Права обновлены у ${formatNumber(changed)} ${plural(changed, { one: 'роли', few: 'ролей', many: 'ролей' })}`,
      );
      onOpenChange(false);
      onDone();
    } catch (error) {
      const blocked = blockedFromError(error);
      setServerBlocked(blocked);
      toast.error(getErrorMessage(error));
      throw error;
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Изменить права ролей</DialogTitle>
            <DialogDescription>
              Выбрано {formatNumber(roles.length)}{' '}
              {plural(roles.length, { one: 'роль', few: 'роли', many: 'ролей' })}. Операция
              атомарна: либо все роли получат изменения, либо ни одна.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-5">
            <ul className="flex flex-wrap gap-1.5" aria-label="Выбранные роли">
              {roles.map((role) => (
                <li key={role.id}>
                  <Badge color={role.color ?? null}>{role.displayName}</Badge>
                </li>
              ))}
            </ul>

            {protectedRoles.length > 0 || serverBlocked.length > 0 ? (
              <div
                role="alert"
                className="flex gap-3 rounded-lg bg-destructive-soft p-3 text-sm text-destructive"
              >
                <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                <div>
                  <p className="font-medium">Эти роли изменить нельзя — снимите их с выбора:</p>
                  <ul className="mt-1 list-disc pl-4">
                    {protectedRoles.map(({ role, reason }) => (
                      <li key={role.id}>
                        {role.displayName}: {reason}
                      </li>
                    ))}
                    {serverBlocked.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}

            <SegmentedControl
              aria-label="Действие с правами"
              value={mode}
              onValueChange={(value) => setMode(value as Mode)}
              fullWidth
              options={[
                { value: 'add', label: 'Добавить', icon: <Plus /> },
                { value: 'remove', label: 'Убрать', icon: <Minus /> },
                { value: 'replace', label: 'Заменить', icon: <Replace /> },
              ]}
            />
            <p className="-mt-3 text-sm text-muted-foreground">{MODE_HINT[mode]}</p>

            <Field label="Права" required={mode !== 'replace'}>
              <MultiSelect
                options={options}
                value={keys}
                onValueChange={setKeys}
                placeholder="Выберите права"
                searchPlaceholder="Поиск по ключу или описанию"
                emptyText="Ничего не найдено"
                loading={catalog.isPending}
                collapseAfter={6}
              />
            </Field>

            <section aria-label="Предпросмотр изменений" className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">Предпросмотр</h3>
              {loadingDetails ? (
                <Skeleton className="h-20 w-full" />
              ) : (
                <ul className="flex max-h-60 flex-col divide-y divide-border-subtle overflow-y-auto rounded-lg bg-background-subtle scrollbar-thin">
                  {preview.map(({ role, added, removed }) => (
                    <li key={role.id} className="flex flex-col gap-1 px-3 py-2 text-sm">
                      <span className="font-medium">{role.displayName}</span>
                      {added.length === 0 && removed.length === 0 ? (
                        <span className="text-muted-foreground">без изменений</span>
                      ) : (
                        <span className="flex flex-wrap gap-1 font-mono text-xs">
                          {added.map((key) => (
                            <span
                              key={`+${key}`}
                              className="rounded-sm bg-success-soft px-1.5 text-success"
                            >
                              +{key}
                            </span>
                          ))}
                          {removed.map((key) => (
                            <span
                              key={`-${key}`}
                              className="rounded-sm bg-destructive-soft px-1.5 text-destructive"
                            >
                              −{key}
                            </span>
                          ))}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button
              variant={mode === 'replace' ? 'destructive' : 'primary'}
              disabled={!canApply}
              loading={mutation.isPending}
              onClick={() =>
                mode === 'replace' ? setConfirmReplace(true) : apply().catch(() => {})
              }
            >
              Применить изменения
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmReplace}
        onOpenChange={setConfirmReplace}
        title="Заменить набор прав?"
        description={`У ${formatNumber(roles.length)} ${plural(roles.length, { one: 'роли', few: 'ролей', many: 'ролей' })} текущие права будут удалены и заменены выбранным списком (${formatNumber(keys.length)}).`}
        confirmLabel="Заменить права"
        destructive
        onConfirm={apply}
      />
    </>
  );
}
