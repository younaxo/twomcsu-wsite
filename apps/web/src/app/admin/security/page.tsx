'use client';

import type { AdminSessionDto, SuspiciousIpDto } from '@twomc/shared';
import { Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PageHeader, PageSection } from '@/components/admin/page-header';
import { PermissionGate } from '@/components/admin/permission-gate';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataGrid, type DataGridColumn } from '@/components/ui/data-grid';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
import {
  useSecurityLogins,
  useSecuritySessions,
  useSetIpWhitelist,
  useSiteSettings,
  useSuspiciousIps,
} from '@/lib/admin/hooks';
import { getErrorMessage } from '@/lib/api/errors';
import { usePermissions } from '@/lib/auth/use-permissions';
import { formatDateTime, formatNumber, formatRelative } from '@/lib/format';

function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

const SESSION_STATUS_COLUMN: DataGridColumn<AdminSessionDto> = {
  key: 'status',
  header: 'Статус',
  cell: (s) => (
    <StatusBadge status={s.revokedAt ? 'blocked' : 'active'}>
      {s.revokedAt ? 'Отозвана' : 'Активна'}
    </StatusBadge>
  ),
};

function SessionsTab({ kind }: { kind: 'sessions' | 'logins' }) {
  const [userId, setUserId] = useState('');
  const debounced = useDebounced(userId.trim());
  const sessions = useSecuritySessions(debounced || undefined, kind === 'sessions');
  const logins = useSecurityLogins(debounced || undefined, kind === 'logins');
  const query = kind === 'sessions' ? sessions : logins;

  const columns: DataGridColumn<AdminSessionDto>[] = [
    {
      key: 'user',
      header: 'Пользователь',
      cell: (s) => <span className="font-medium">{s.user.username}</span>,
    },
    {
      key: 'ip',
      header: 'IP',
      cell: (s) => <span className="font-mono text-xs">{s.ipAddress ?? '—'}</span>,
    },
    {
      key: 'device',
      header: 'Устройство',
      width: 224,
      truncate: true,
      hideOnMobile: true,
      cell: (s) => <span className="text-xs text-muted-foreground">{s.userAgent ?? '—'}</span>,
    },
    {
      key: 'created',
      header: kind === 'sessions' ? 'Создана' : 'Вход',
      cell: (s) => formatDateTime(s.createdAt),
    },
    {
      key: 'expires',
      header: 'Истекает',
      hideOnMobile: true,
      cell: (s) => formatRelative(s.expiresAt),
    },
    SESSION_STATUS_COLUMN,
  ];

  return (
    <PageSection
      actions={
        <div className="w-full sm:w-80">
          <Input
            leading={<Search />}
            placeholder="Фильтр по ID пользователя"
            aria-label="ID пользователя"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="font-mono"
          />
        </div>
      }
    >
      <DataGrid
        columns={columns}
        rows={query.data ?? []}
        getRowId={(s) => s.id}
        loading={query.isPending}
        error={query.isError ? query.error : undefined}
        onRetry={() => query.refetch()}
        emptyTitle={kind === 'sessions' ? 'Активных сессий нет' : 'Входов нет'}
        caption={
          kind === 'sessions'
            ? 'Сессии: пользователь, IP, устройство, дата создания, срок действия, статус'
            : 'История входов: пользователь, IP, устройство, время входа, срок действия, статус'
        }
      />
    </PageSection>
  );
}

const SUSPICIOUS_COLUMNS: DataGridColumn<SuspiciousIpDto>[] = [
  {
    key: 'ip',
    header: 'IP',
    cell: (row) => <span className="font-mono text-xs">{row.ip}</span>,
  },
  {
    key: 'failed',
    header: 'Неудачных попыток',
    align: 'right',
    cell: (row) => formatNumber(row.failedAttempts),
  },
  {
    key: 'status',
    header: 'Статус',
    cell: (row) => (
      <StatusBadge status={row.isBlocked ? 'blocked' : 'warning'}>
        {row.isBlocked ? 'Заблокирован' : 'Под наблюдением'}
      </StatusBadge>
    ),
  },
  {
    key: 'block',
    header: 'Блокировка',
    cell: (row) =>
      row.blockedTtlSeconds !== null ? `ещё ${Math.ceil(row.blockedTtlSeconds / 60)} мин` : '—',
  },
];

function SuspiciousTab() {
  const suspicious = useSuspiciousIps();
  return (
    <PageSection
      description="Счётчики неудачных входов по IP (Redis). Обновляется каждые 30 секунд."
      actions={
        <Button
          variant="secondary"
          size="sm"
          onClick={() => suspicious.refetch()}
          loading={suspicious.isFetching}
        >
          <RefreshCw />
          Обновить
        </Button>
      }
    >
      <DataGrid
        columns={SUSPICIOUS_COLUMNS}
        rows={suspicious.data ?? []}
        getRowId={(row) => row.ip}
        loading={suspicious.isPending}
        error={suspicious.isError ? suspicious.error : undefined}
        onRetry={() => suspicious.refetch()}
        emptyTitle="Подозрительной активности нет"
        caption="Подозрительные IP: адрес, число неудачных попыток, статус, остаток блокировки"
      />
    </PageSection>
  );
}

const IP_PATTERN = /^(\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?|[0-9a-f:]+(\/\d{1,3})?)$/i;

function WhitelistTab() {
  const { can } = usePermissions();
  const settings = useSiteSettings(can('settings.site.view'));
  const save = useSetIpWhitelist();
  const [ips, setIps] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (settings.data && !loaded) {
      setIps(settings.data.ipWhitelist);
      setLoaded(true);
    }
  }, [settings.data, loaded]);

  const add = () => {
    const value = draft.trim();
    if (!IP_PATTERN.test(value) || ips.includes(value)) {
      return;
    }
    setIps([...ips, value]);
    setDraft('');
  };

  return (
    <PageSection description="Полная замена списка разрешённых IP для админки. Пустой список — ограничений нет.">
      <Card className="flex max-w-2xl flex-col gap-4">
        {settings.isError ? (
          <p className="text-sm text-muted-foreground">
            Текущий список недоступен (нет права settings.site.view) — вы заменяете его целиком.
          </p>
        ) : null}
        <Field label="Добавить IP или CIDR" hint="Например 203.0.113.10 или 203.0.113.0/24">
          <Input
            value={draft}
            className="font-mono"
            invalid={draft !== '' && !IP_PATTERN.test(draft.trim())}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            trailing={
              <IconButton
                aria-label="Добавить"
                size="sm"
                onClick={add}
                disabled={!IP_PATTERN.test(draft.trim())}
              >
                <Plus />
              </IconButton>
            }
          />
        </Field>
        {ips.length === 0 ? (
          <p className="text-sm text-muted-foreground">Список пуст.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {ips.map((ip) => (
              <li key={ip}>
                <Badge tone="outline" className="gap-1 font-mono">
                  {ip}
                  <button
                    type="button"
                    aria-label={`Убрать ${ip}`}
                    className="ml-1 rounded-sm text-subtle-foreground hover:text-destructive"
                    onClick={() => setIps(ips.filter((x) => x !== ip))}
                  >
                    <Trash2 className="size-3" />
                  </button>
                </Badge>
              </li>
            ))}
          </ul>
        )}
        <div>
          <Button onClick={() => setConfirm(true)} loading={save.isPending}>
            Сохранить список
          </Button>
        </div>
      </Card>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Заменить IP-whitelist?"
        description={
          ips.length > 0
            ? `Доступ к админке останется только с ${formatNumber(ips.length)} адресов. Убедитесь, что ваш IP в списке — иначе вы потеряете доступ.`
            : 'Список будет очищен: ограничения по IP сняты.'
        }
        confirmLabel="Заменить"
        destructive={ips.length > 0}
        loading={save.isPending}
        onConfirm={async () => {
          try {
            await save.mutateAsync(ips);
            toast.success('IP-whitelist сохранён');
            setConfirm(false);
          } catch (error) {
            toast.error(getErrorMessage(error));
          }
        }}
      />
    </PageSection>
  );
}

export default function SecurityPage() {
  const { can } = usePermissions();
  const tabs = [
    can('security.sessions.view') && { value: 'sessions', label: 'Сессии' },
    can('security.logins.view') && { value: 'logins', label: 'Входы' },
    can('security.suspicious.view') && { value: 'suspicious', label: 'Подозрительные IP' },
    can('security.ip_whitelist.create') && { value: 'whitelist', label: 'IP-whitelist' },
  ].filter((t): t is { value: string; label: string } => Boolean(t));

  return (
    <PermissionGate
      requirement={[
        'security.sessions.view',
        'security.logins.view',
        'security.suspicious.view',
        'security.ip_whitelist.create',
      ]}
    >
      <PageHeader
        title="Безопасность"
        breadcrumbs={[{ label: 'Безопасность' }]}
        description="Сессии, история входов, brute-force по IP и whitelist админки."
      />
      <Tabs defaultValue={tabs[0]?.value} variant="line">
        <TabsList aria-label="Разделы безопасности">
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="sessions">
          <SessionsTab kind="sessions" />
        </TabsContent>
        <TabsContent value="logins">
          <SessionsTab kind="logins" />
        </TabsContent>
        <TabsContent value="suspicious">
          <SuspiciousTab />
        </TabsContent>
        <TabsContent value="whitelist">
          <WhitelistTab />
        </TabsContent>
      </Tabs>
    </PermissionGate>
  );
}
