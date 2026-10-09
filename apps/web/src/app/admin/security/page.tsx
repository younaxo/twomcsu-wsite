'use client';

import type { AdminSessionDto } from '@twomc/shared';
import { Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PageHeader, PageSection } from '@/components/admin/page-header';
import { PermissionGate } from '@/components/admin/permission-gate';
import { QueryBoundary } from '@/components/admin/query-boundary';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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

function SessionsTable({ rows, kind }: { rows: AdminSessionDto[]; kind: 'sessions' | 'logins' }) {
  if (rows.length === 0) {
    return (
      <EmptyState size="sm" title={kind === 'sessions' ? 'Активных сессий нет' : 'Входов нет'} />
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Пользователь</TableHead>
          <TableHead>IP</TableHead>
          <TableHead>Устройство</TableHead>
          <TableHead>{kind === 'sessions' ? 'Создана' : 'Вход'}</TableHead>
          <TableHead>Истекает</TableHead>
          <TableHead>Статус</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((s) => (
          <TableRow key={s.id}>
            <TableCell className="font-medium">{s.user.username}</TableCell>
            <TableCell className="font-mono text-xs">{s.ipAddress ?? '—'}</TableCell>
            <TableCell truncate className="max-w-56 text-xs text-muted-foreground">
              {s.userAgent ?? '—'}
            </TableCell>
            <TableCell>{formatDateTime(s.createdAt)}</TableCell>
            <TableCell>{formatRelative(s.expiresAt)}</TableCell>
            <TableCell>
              <StatusBadge status={s.revokedAt ? 'blocked' : 'active'}>
                {s.revokedAt ? 'Отозвана' : 'Активна'}
              </StatusBadge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function SessionsTab({ kind }: { kind: 'sessions' | 'logins' }) {
  const [userId, setUserId] = useState('');
  const debounced = useDebounced(userId.trim());
  const sessions = useSecuritySessions(debounced || undefined, kind === 'sessions');
  const logins = useSecurityLogins(debounced || undefined, kind === 'logins');
  const query = kind === 'sessions' ? sessions : logins;
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
      <Card flush>
        <QueryBoundary query={query}>
          {(rows) => <SessionsTable rows={rows} kind={kind} />}
        </QueryBoundary>
      </Card>
    </PageSection>
  );
}

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
      <Card flush>
        <QueryBoundary query={suspicious}>
          {(rows) =>
            rows.length === 0 ? (
              <EmptyState size="sm" title="Подозрительной активности нет" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>IP</TableHead>
                    <TableHead numeric>Неудачных попыток</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Блокировка</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.ip}>
                      <TableCell className="font-mono text-xs">{row.ip}</TableCell>
                      <TableCell numeric>{formatNumber(row.failedAttempts)}</TableCell>
                      <TableCell>
                        <StatusBadge status={row.isBlocked ? 'blocked' : 'warning'}>
                          {row.isBlocked ? 'Заблокирован' : 'Под наблюдением'}
                        </StatusBadge>
                      </TableCell>
                      <TableCell>
                        {row.blockedTtlSeconds !== null
                          ? `ещё ${Math.ceil(row.blockedTtlSeconds / 60)} мин`
                          : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )
          }
        </QueryBoundary>
      </Card>
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
