'use client';

import {
  USER_BADGE_TYPES,
  type AdminUserFull,
  type PunishmentDto,
  type UserBadgeType,
} from '@twomc/shared';
import { Ban, Copy, Shield, ShieldCheck, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import {
  DescriptionItem,
  DescriptionList,
  PageHeader,
  PageSection,
} from '@/components/admin/page-header';
import { Can, PermissionGate } from '@/components/admin/permission-gate';
import { QueryBoundary } from '@/components/admin/query-boundary';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Avatar } from '@/components/ui/avatar';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DatePicker, type IsoDate } from '@/components/ui/date-picker';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Field } from '@/components/ui/field';
import { RolePrefix } from '@/components/ui/role-prefix';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SkeletonRows } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Timeline, TimelineItem } from '@/components/ui/timeline';
import { toast } from '@/components/ui/toast';
import { Tooltip } from '@/components/ui/tooltip';
import {
  useGrantBadge,
  useRevokeBadge,
  useRevokeRole,
  useUser,
  useUserBadges,
  useUserEffectivePermissions,
  useUserPunishments,
  useUserSessions,
} from '@/lib/admin/hooks';
import { ApiError } from '@/lib/api/errors';
import { getErrorMessage } from '@/lib/api/errors';
import { usePermissions } from '@/lib/auth/use-permissions';
import { formatDate, formatDateTime, formatNumber, formatRelative } from '@/lib/format';
import { pickPrimaryRole } from '@/lib/roles/primary-role';
import { AssignRoleDialog } from '../_components/assign-role-dialog';
import { BanDialog } from '../_components/ban-dialog';

const BADGE_LABEL: Record<UserBadgeType, string> = {
  LEADERSHIP: 'Руководство',
  VERIFIED: 'Подтверждён',
  SUBSCRIBER_PLUS: 'Подписчик+',
  PROJECT_TEAM: 'Команда проекта',
  DEVELOPERS_TEAM: 'Разработчики',
};

const PUNISHMENT_LABEL: Record<PunishmentDto['punishmentType'], string> = {
  WARN: 'Предупреждение',
  MUTE: 'Мут',
  KICK: 'Кик',
  TEMPBAN: 'Временный бан',
  PERMBAN: 'Перманентный бан',
};

function CopyButton({ value, label }: { value: string; label: string }) {
  return (
    <Tooltip content={`Скопировать ${label}`}>
      <IconButton
        aria-label={`Скопировать ${label}`}
        size="sm"
        onClick={() =>
          navigator.clipboard
            .writeText(value)
            .then(() => toast.success('Скопировано'))
            .catch(() => toast.error('Не удалось скопировать'))
        }
      >
        <Copy />
      </IconButton>
    </Tooltip>
  );
}

/* ---------------- Вкладки ---------------- */

function OverviewTab({ user }: { user: AdminUserFull }) {
  return (
    <Card>
      <DescriptionList>
        <DescriptionItem term="ID" mono>
          <span className="inline-flex items-center gap-1">
            {user.id}
            <CopyButton value={user.id} label="ID" />
          </span>
        </DescriptionItem>
        <DescriptionItem term="Короткий ID">#{formatNumber(user.shortId)}</DescriptionItem>
        <DescriptionItem term="Tag" mono>
          {user.tag}
        </DescriptionItem>
        <DescriptionItem term="E-mail">{user.email}</DescriptionItem>
        <DescriptionItem term="Тип аккаунта">
          {user.accountType === 'SYSTEM' ? 'Системный' : 'Обычный'}
        </DescriptionItem>
        <DescriptionItem term="Должность">
          <Badge color={user.position?.color ?? null}>{user.position?.displayName ?? '—'}</Badge>
        </DescriptionItem>
        <DescriptionItem term="Отделы">
          {user.departments.length > 0
            ? user.departments.map((d) => d.department.name).join(', ')
            : '—'}
        </DescriptionItem>
        <DescriptionItem term="Особая должность">
          {user.customPosition?.customPosition.name ?? '—'}
        </DescriptionItem>
        <DescriptionItem term="Регистрация">{formatDateTime(user.createdAt)}</DescriptionItem>
        <DescriptionItem term="Последний вход">
          {user.lastLoginAt
            ? `${formatDateTime(user.lastLoginAt)} (${formatRelative(user.lastLoginAt)})`
            : '—'}
        </DescriptionItem>
      </DescriptionList>
    </Card>
  );
}

function RolesTab({ user }: { user: AdminUserFull }) {
  const { can } = usePermissions();
  const canAssign = can('roles.assign');
  const [assignOpen, setAssignOpen] = useState(false);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const revoke = useRevokeRole(user.id);
  const effective = useUserEffectivePermissions(user.id, can('roles.view'));
  const revoking = user.roles.find((r) => r.roleId === revokeId);

  const groups = effective.data
    ? effective.data.permissions.reduce<Record<string, string[]>>((acc, key) => {
        const moduleName = key.split('.')[0] ?? key;
        (acc[moduleName] ??= []).push(key);
        return acc;
      }, {})
    : {};

  return (
    <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
      <PageSection
        title="Роли"
        actions={
          canAssign ? (
            <Button size="sm" onClick={() => setAssignOpen(true)}>
              <Shield />
              Выдать роль
            </Button>
          ) : null
        }
      >
        <Card flush>
          {user.roles.length === 0 ? (
            <EmptyState size="sm" title="Ролей нет" description="Пользователь — обычный игрок." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Роль</TableHead>
                  <TableHead numeric>Приоритет</TableHead>
                  <TableHead>Выдана</TableHead>
                  {canAssign ? <TableHead /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...user.roles]
                  .sort((a, b) => b.role.priority - a.role.priority)
                  .map((entry) => (
                    <TableRow key={entry.roleId}>
                      <TableCell>
                        <span className="inline-flex items-center gap-2">
                          <RolePrefix role={entry.role} size="xs" />
                          <span>{entry.role.displayName}</span>
                          {entry.role.isSuperuser ? <Badge tone="primary">superuser</Badge> : null}
                        </span>
                      </TableCell>
                      <TableCell numeric>{entry.role.priority}</TableCell>
                      <TableCell>{formatDate(entry.assignedAt)}</TableCell>
                      {canAssign ? (
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setRevokeId(entry.roleId)}
                            aria-label={`Снять роль ${entry.role.displayName}`}
                          >
                            Снять
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </PageSection>

      <Can requirement="roles.view">
        <PageSection
          title="Эффективные права"
          description="Итог по всем ролям, как видит их backend."
        >
          <Card>
            <QueryBoundary query={effective} skeleton={<SkeletonRows rows={3} />} size="sm">
              {(data) =>
                data.superuser ? (
                  <p className="text-sm">
                    <Badge tone="primary">superuser</Badge>{' '}
                    <span className="text-muted-foreground">Все права без ограничений.</span>
                  </p>
                ) : data.permissions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Прав нет.</p>
                ) : (
                  <div className="flex flex-col gap-3 text-sm">
                    <p className="text-muted-foreground">
                      {formatNumber(data.permissions.length)} ключей · максимальный приоритет{' '}
                      {data.maxPriority ?? '—'}
                    </p>
                    {Object.entries(groups).map(([module, keys]) => (
                      <div key={module}>
                        <p className="mb-1 font-mono text-xs text-subtle-foreground">{module}</p>
                        <div className="flex flex-wrap gap-1">
                          {keys.map((key) => (
                            <Badge key={key} className="font-mono">
                              {key}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              }
            </QueryBoundary>
          </Card>
        </PageSection>
      </Can>

      <AssignRoleDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        userId={user.id}
        username={user.username}
        assignedRoleIds={user.roles.map((r) => r.roleId)}
      />
      <ConfirmDialog
        open={revokeId !== null}
        onOpenChange={(open) => (open ? null : setRevokeId(null))}
        title={`Снять роль «${revoking?.role.displayName ?? ''}»?`}
        description="Права роли исчезнут сразу."
        confirmLabel="Снять"
        destructive
        loading={revoke.isPending}
        onConfirm={async () => {
          if (!revokeId) return;
          try {
            await revoke.mutateAsync(revokeId);
            toast.success('Роль снята');
            setRevokeId(null);
          } catch (error) {
            toast.error(getErrorMessage(error));
          }
        }}
      />
    </div>
  );
}

function BadgesTab({ user }: { user: AdminUserFull }) {
  const badges = useUserBadges(user.id);
  const grant = useGrantBadge(user.id);
  const revoke = useRevokeBadge(user.id);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<UserBadgeType>('VERIFIED');
  const [expires, setExpires] = useState<IsoDate | null>(null);
  const [revokeType, setRevokeType] = useState<UserBadgeType | null>(null);

  return (
    <PageSection
      title="Бейджи"
      actions={
        <Button size="sm" onClick={() => setOpen(true)}>
          Выдать бейдж
        </Button>
      }
    >
      <Card flush>
        <QueryBoundary query={badges} size="sm">
          {(data) =>
            data.length === 0 ? (
              <EmptyState size="sm" title="Бейджей нет" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Бейдж</TableHead>
                    <TableHead>Выдан</TableHead>
                    <TableHead>Истекает</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((badge) => (
                    <TableRow key={badge.id}>
                      <TableCell>{BADGE_LABEL[badge.type]}</TableCell>
                      <TableCell>{formatDate(badge.grantedAt)}</TableCell>
                      <TableCell>
                        {badge.expiresAt ? formatDate(badge.expiresAt) : 'бессрочно'}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={badge.isActive ? 'active' : 'idle'} />
                      </TableCell>
                      <TableCell className="text-right">
                        <IconButton
                          aria-label={`Снять бейдж ${BADGE_LABEL[badge.type]}`}
                          size="sm"
                          onClick={() => setRevokeType(badge.type)}
                        >
                          <Trash2 />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )
          }
        </QueryBoundary>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Выдать бейдж</DialogTitle>
            <DialogDescription>Бейдж виден в профиле {user.username}.</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <Field label="Тип" required>
              <Select value={type} onValueChange={(v) => setType(v as UserBadgeType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {USER_BADGE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {BADGE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Действует до" hint="Пусто — бессрочно">
              <DatePicker value={expires} onChange={setExpires} clearable />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button
              loading={grant.isPending}
              onClick={async () => {
                try {
                  await grant.mutateAsync({
                    type,
                    expiresAt: expires ? new Date(`${expires}T23:59:59`).toISOString() : undefined,
                  });
                  toast.success('Бейдж выдан');
                  setOpen(false);
                } catch (error) {
                  toast.error(getErrorMessage(error));
                }
              }}
            >
              Выдать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={revokeType !== null}
        onOpenChange={(o) => (o ? null : setRevokeType(null))}
        title={`Снять бейдж «${revokeType ? BADGE_LABEL[revokeType] : ''}»?`}
        confirmLabel="Снять"
        destructive
        loading={revoke.isPending}
        onConfirm={async () => {
          if (!revokeType) return;
          try {
            await revoke.mutateAsync(revokeType);
            toast.success('Бейдж снят');
            setRevokeType(null);
          } catch (error) {
            toast.error(getErrorMessage(error));
          }
        }}
      />
    </PageSection>
  );
}

function PunishmentsTab({ user }: { user: AdminUserFull }) {
  const punishments = useUserPunishments(user.username);
  return (
    <Card>
      <QueryBoundary query={punishments} size="sm">
        {(data) =>
          data.length === 0 ? (
            <EmptyState size="sm" title="Наказаний нет" description="Чистая история." />
          ) : (
            <Timeline>
              {data.map((p) => (
                <TimelineItem
                  key={p.id}
                  tone={
                    p.isActive
                      ? p.punishmentType === 'WARN'
                        ? 'warning'
                        : 'destructive'
                      : 'neutral'
                  }
                  title={
                    <span className="flex flex-wrap items-center gap-2">
                      {PUNISHMENT_LABEL[p.punishmentType]}
                      {p.isActive ? (
                        <Badge tone="destructive">активно</Badge>
                      ) : (
                        <Badge>снято</Badge>
                      )}
                      {p.server ? <Badge tone="outline">{p.server}</Badge> : null}
                    </span>
                  }
                  meta={`${formatDateTime(p.issuedAt)}${p.expiresAt ? ` → ${formatDateTime(p.expiresAt)}` : ''}${p.duration ? ` · ${p.duration}` : ''}`}
                >
                  <p className="text-sm">{p.reason}</p>
                </TimelineItem>
              ))}
            </Timeline>
          )
        }
      </QueryBoundary>
    </Card>
  );
}

function SessionsTab({ user }: { user: AdminUserFull }) {
  const sessions = useUserSessions(user.id);
  return (
    <Card flush>
      <QueryBoundary query={sessions} size="sm">
        {(data) =>
          data.length === 0 ? (
            <EmptyState size="sm" title="Сессий нет" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Устройство</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Создана</TableHead>
                  <TableHead>Истекает</TableHead>
                  <TableHead>Статус</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell truncate className="max-w-64">
                      {s.userAgent ?? '—'}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{s.ipAddress ?? '—'}</TableCell>
                    <TableCell>{formatDateTime(s.createdAt)}</TableCell>
                    <TableCell>{formatDateTime(s.expiresAt)}</TableCell>
                    <TableCell>
                      <StatusBadge status={s.revokedAt ? 'blocked' : 'active'}>
                        {s.revokedAt ? 'Отозвана' : 'Активна'}
                      </StatusBadge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )
        }
      </QueryBoundary>
    </Card>
  );
}

/* ---------------- Страница ---------------- */

function UserDetails({ user }: { user: AdminUserFull }) {
  const { can } = usePermissions();
  const [ban, setBan] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const primary = pickPrimaryRole(user.roles.map((r) => r.role));

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Пользователи', href: '/admin/users' }, { label: user.username }]}
        title={
          <span className="inline-flex items-center gap-3">
            <Avatar name={user.username} size="md" shape="round" />
            <span className="inline-flex items-center gap-2">
              {primary ? <RolePrefix role={primary} size="sm" /> : null}
              {user.username}
            </span>
          </span>
        }
        meta={
          <>
            {user.isBanned ? <StatusBadge status="blocked">Забанен</StatusBadge> : null}
            {!user.isVerified ? <StatusBadge status="pending">Не подтверждён</StatusBadge> : null}
            {user.accountType === 'SYSTEM' ? <Badge tone="info">Системный</Badge> : null}
          </>
        }
        description={`${user.tag} · ${user.email}`}
        actions={
          <>
            {can('roles.assign') ? (
              <Button variant="secondary" onClick={() => setAssignOpen(true)}>
                <Shield />
                Выдать роль
              </Button>
            ) : null}
            {can('users.bulk.edit') ? (
              user.isBanned ? (
                <Button variant="secondary" onClick={() => setBan(true)}>
                  <ShieldCheck />
                  Разбанить
                </Button>
              ) : (
                <Button variant="destructive-outline" onClick={() => setBan(true)}>
                  <Ban />
                  Забанить
                </Button>
              )
            ) : null}
          </>
        }
      />

      <Tabs defaultValue="overview" variant="line">
        <TabsList aria-label="Разделы карточки">
          <TabsTrigger value="overview">Обзор</TabsTrigger>
          <TabsTrigger value="roles" count={user.roles.length}>
            Роли
          </TabsTrigger>
          {can('users.badges') ? <TabsTrigger value="badges">Бейджи</TabsTrigger> : null}
          {can('users.punishments') ? (
            <TabsTrigger value="punishments">Наказания</TabsTrigger>
          ) : null}
          {can('security.sessions.view') ? (
            <TabsTrigger value="sessions">Сессии</TabsTrigger>
          ) : null}
        </TabsList>
        <TabsContent value="overview">
          <OverviewTab user={user} />
        </TabsContent>
        <TabsContent value="roles">
          <RolesTab user={user} />
        </TabsContent>
        <TabsContent value="badges">
          <BadgesTab user={user} />
        </TabsContent>
        <TabsContent value="punishments">
          <PunishmentsTab user={user} />
        </TabsContent>
        <TabsContent value="sessions">
          <SessionsTab user={user} />
        </TabsContent>
      </Tabs>

      <BanDialog
        open={ban}
        onOpenChange={setBan}
        action={user.isBanned ? 'UNBAN' : 'BAN'}
        userIds={[user.id]}
        label={user.username}
      />
      <AssignRoleDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        userId={user.id}
        username={user.username}
        assignedRoleIds={user.roles.map((r) => r.roleId)}
      />
    </>
  );
}

export default function UserPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const query = useUser(id);

  return (
    <PermissionGate requirement="users.view">
      {query.isError && query.error instanceof ApiError && query.error.status === 404 ? (
        <div className="flex flex-col items-center gap-4">
          <ErrorState
            title="Пользователь не найден"
            description="Возможно, аккаунт удалён или ссылка устарела."
          />
          <Button asChild variant="secondary">
            <Link href="/admin/users">К списку</Link>
          </Button>
        </div>
      ) : (
        <QueryBoundary query={query}>{(user) => <UserDetails user={user} />}</QueryBoundary>
      )}
    </PermissionGate>
  );
}
