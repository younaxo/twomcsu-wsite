'use client';

import type { AdminUserFull, PermissionKey } from '@twomc/shared';
import { X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { PageSection } from '@/components/admin/page-header';
import { AchievementIcon } from '@/components/achievements/achievement-icon';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { inputClassName } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { useAdminAwards } from '@/lib/admin/awards';
import { useAdminPositions } from '@/lib/admin/positions';
import { CUSTOM_POSITIONS, DEPARTMENTS, useTeamCatalog } from '@/lib/admin/team';
import {
  useUserAssignments,
  useUserAwards,
  type UserAwardEntry,
} from '@/lib/admin/user-assignments';
import { getErrorMessage } from '@/lib/api/errors';
import { usePermissions } from '@/lib/auth/use-permissions';
import { formatDate } from '@/lib/format';

/// «Команда и награды» в карточке пользователя (срез 7.6, ADR-0142):
/// должность, отделы, своя должность и награды. Блок виден только с правом
/// на его действие; список вариантов — только с правом на каталог.

/// Вкладка видна с правом хотя бы на одно назначение.
export const TEAM_TAB_REQUIREMENT: readonly PermissionKey[] = [
  'positions.assign',
  'departments.assign',
  'custom_positions.assign',
  'users.awards',
];

function Picker({
  label,
  options,
  actionLabel,
  loading,
  onPick,
}: {
  label: string;
  options: { value: string; label: string }[];
  actionLabel: string;
  loading: boolean;
  onPick: (value: string) => void;
}) {
  const [value, setValue] = useState('');
  if (options.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label={label}
        className={`${inputClassName} w-auto min-w-48`}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      >
        <option value="">Выберите…</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <Button
        size="sm"
        variant="secondary"
        disabled={!value}
        loading={loading}
        onClick={() => {
          onPick(value);
          setValue('');
        }}
      >
        {actionLabel}
      </Button>
    </div>
  );
}

function notify(success: string) {
  return {
    onSuccess: () => toast.success(success),
    onError: (error: unknown) => toast.error(getErrorMessage(error)),
  };
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{title}</h3>
      {children}
    </div>
  );
}

function PositionBlock({ user }: { user: AdminUserFull }) {
  const { can } = usePermissions();
  const positions = useAdminPositions(can('positions.view'));
  const { assignPosition } = useUserAssignments(user.id);
  const options = (positions.data ?? [])
    .filter((position) => position.id !== user.position.id)
    .map((position) => ({ value: position.id, label: position.displayName }));
  return (
    <Block title="Должность">
      <div>
        <Badge color={user.position.color}>{user.position.displayName}</Badge>
      </div>
      <Picker
        label="Новая должность"
        options={options}
        actionLabel="Назначить"
        loading={assignPosition.isPending}
        onPick={(id) => assignPosition.mutate(id, notify('Должность назначена'))}
      />
    </Block>
  );
}

function DepartmentsBlock({ user }: { user: AdminUserFull }) {
  const { can } = usePermissions();
  const departments = useTeamCatalog(DEPARTMENTS, can('departments.view'));
  const { addDepartment, removeDepartment } = useUserAssignments(user.id);
  const current = new Set(user.departments.map((entry) => entry.departmentId));
  const options = (departments.data ?? [])
    .filter((department) => department.isActive && !current.has(department.id))
    .map((department) => ({ value: department.id, label: department.name }));
  return (
    <Block title="Отделы">
      {user.departments.length === 0 ? (
        <p className="text-sm text-muted-foreground">Не состоит в отделах.</p>
      ) : (
        <ul className="flex flex-wrap gap-2" data-testid="user-departments">
          {user.departments.map((entry) => (
            <li key={entry.departmentId} className="inline-flex items-center gap-1">
              <Badge color={entry.department.color ?? null}>{entry.department.name}</Badge>
              <IconButton
                size="sm"
                aria-label={`Убрать из отдела ${entry.department.name}`}
                disabled={removeDepartment.isPending}
                onClick={() =>
                  removeDepartment.mutate(entry.departmentId, notify('Убран из отдела'))
                }
              >
                <X />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      <Picker
        label="Добавить в отдел"
        options={options}
        actionLabel="Добавить"
        loading={addDepartment.isPending}
        onPick={(id) => addDepartment.mutate(id, notify('Добавлен в отдел'))}
      />
    </Block>
  );
}

function CustomPositionBlock({ user }: { user: AdminUserFull }) {
  const { can } = usePermissions();
  const catalog = useTeamCatalog(CUSTOM_POSITIONS, can('custom_positions.view'));
  const { setCustomPosition, clearCustomPosition } = useUserAssignments(user.id);
  const currentId = user.customPosition?.customPositionId ?? null;
  const options = (catalog.data ?? [])
    .filter((item) => item.isActive && item.id !== currentId)
    .map((item) => ({ value: item.id, label: item.name }));
  return (
    <Block title="Своя должность">
      {user.customPosition ? (
        <div className="flex items-center gap-2">
          <Badge color={user.customPosition.customPosition.color ?? null}>
            {user.customPosition.customPosition.name}
          </Badge>
          <Button
            size="sm"
            variant="ghost"
            loading={clearCustomPosition.isPending}
            onClick={() => clearCustomPosition.mutate(undefined, notify('Своя должность снята'))}
          >
            Снять
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Нет.</p>
      )}
      <Picker
        label="Своя должность"
        options={options}
        actionLabel={user.customPosition ? 'Заменить' : 'Назначить'}
        loading={setCustomPosition.isPending}
        onPick={(id) => setCustomPosition.mutate(id, notify('Своя должность назначена'))}
      />
    </Block>
  );
}

function AwardsBlock({ user }: { user: AdminUserFull }) {
  const { can } = usePermissions();
  const owned = useUserAwards(user.id, true);
  const catalog = useAdminAwards(can('awards.view'));
  const { grantAward, revokeAward } = useUserAssignments(user.id);
  const [revoking, setRevoking] = useState<UserAwardEntry | null>(null);
  const ownedIds = new Set((owned.data ?? []).map((entry) => entry.awardId));
  const options = (catalog.data ?? [])
    .filter((award) => award.isActive && !ownedIds.has(award.id))
    .map((award) => ({ value: award.id, label: award.name }));
  return (
    <Block title="Награды">
      {owned.isPending ? (
        <SkeletonRows rows={2} />
      ) : owned.isError ? (
        <ErrorState error={owned.error} onRetry={() => owned.refetch()} />
      ) : owned.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">Наград нет.</p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="user-awards">
          {owned.data.map((entry) => (
            <li key={entry.awardId} className="flex items-center gap-3">
              <AchievementIcon iconUrl={entry.award.iconUrl} completed />
              <span className="min-w-0 flex-1 text-sm">
                {entry.award.name}
                <span className="ml-2 text-xs text-muted-foreground">
                  {formatDate(entry.grantedAt)}
                </span>
              </span>
              <Button size="sm" variant="ghost" onClick={() => setRevoking(entry)}>
                Снять
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Picker
        label="Выдать награду"
        options={options}
        actionLabel="Выдать"
        loading={grantAward.isPending}
        onPick={(id) => grantAward.mutate(id, notify('Награда выдана'))}
      />
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => !open && setRevoking(null)}
        title={`Снять награду «${revoking?.award.name ?? ''}»?`}
        confirmLabel="Снять"
        destructive
        loading={revokeAward.isPending}
        onConfirm={() =>
          revokeAward.mutate(revoking!.awardId, {
            onSuccess: () => {
              toast.success('Награда снята');
              setRevoking(null);
            },
            onError: (error) => toast.error(getErrorMessage(error)),
          })
        }
      />
    </Block>
  );
}

export function TeamTab({ user }: { user: AdminUserFull }) {
  const { can } = usePermissions();
  return (
    <PageSection title="Команда и награды">
      <div className="grid gap-6 md:grid-cols-2" data-testid="team-tab">
        {can('positions.assign') ? <PositionBlock user={user} /> : null}
        {can('departments.assign') ? <DepartmentsBlock user={user} /> : null}
        {can('custom_positions.assign') ? <CustomPositionBlock user={user} /> : null}
        {can('users.awards') ? <AwardsBlock user={user} /> : null}
      </div>
    </PageSection>
  );
}
