'use client';

import type { AuditLogEntry, AuditLogSeverity } from '@twomc/shared';
import { Ban, Flag, ScrollText, UserPlus, Users, Wifi } from 'lucide-react';
import Link from 'next/link';
import { PageHeader, PageSection, StatCard, StatGrid } from '@/components/admin/page-header';
import { Can, PermissionGate } from '@/components/admin/permission-gate';
import { QueryBoundary } from '@/components/admin/query-boundary';
import { DashboardCharts } from './_components/dashboard-charts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Timeline, TimelineItem } from '@/components/ui/timeline';
import { useDashboard } from '@/lib/admin/hooks';
import { useAuthStore } from '@/lib/auth/store';
import { formatNumber, formatRelative, plural } from '@/lib/format';

const SEVERITY_TONE: Record<AuditLogSeverity, 'neutral' | 'warning' | 'destructive'> = {
  info: 'neutral',
  warning: 'warning',
  critical: 'destructive',
};

const SEVERITY_LABEL: Record<AuditLogSeverity, string> = {
  info: 'Инфо',
  warning: 'Внимание',
  critical: 'Критично',
};

function AuditEntry({ entry }: { entry: AuditLogEntry }) {
  return (
    <TimelineItem
      tone={
        entry.severity === 'critical'
          ? 'destructive'
          : entry.severity === 'warning'
            ? 'warning'
            : 'neutral'
      }
      title={
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs">{entry.action}</span>
          <Badge tone={SEVERITY_TONE[entry.severity]}>{SEVERITY_LABEL[entry.severity]}</Badge>
        </span>
      }
      meta={
        <>
          {entry.actor.username}
          {entry.targetType ? ` · ${entry.targetType}` : ''}
          {' · '}
          <time dateTime={entry.createdAt}>{formatRelative(entry.createdAt)}</time>
        </>
      }
    />
  );
}

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const query = useDashboard();

  return (
    <PermissionGate requirement="dashboard.view">
      <PageHeader
        title="Дашборд"
        description={user ? `Привет, ${user.username}. Сводка по проекту на сейчас.` : undefined}
        actions={
          <Can requirement="audit_log.view">
            <Button asChild variant="secondary">
              <Link href="/admin/audit-log">
                <ScrollText />
                Журнал аудита
              </Link>
            </Button>
          </Can>
        }
      />

      <QueryBoundary
        query={query}
        skeleton={
          <StatGrid>
            {Array.from({ length: 4 }, (_, index) => (
              <StatCard
                key={index}
                label={<Skeleton className="h-4 w-24" />}
                value={null}
                loading
              />
            ))}
          </StatGrid>
        }
      >
        {(data) => {
          const pendingTotal =
            data.moderation.pendingReports +
            data.moderation.pendingCommentReports +
            data.moderation.pendingProfileReports;
          return (
            <>
              <StatGrid>
                <StatCard
                  label="Всего аккаунтов"
                  value={data.users.total}
                  icon={<Users />}
                  note={`+${formatNumber(data.users.newToday)} за сегодня`}
                />
                <StatCard
                  label="Сейчас онлайн"
                  value={data.users.online}
                  icon={<Wifi />}
                  tone="success"
                  note="по активным сессиям сайта"
                />
                <StatCard
                  label="Обращений в очереди"
                  value={pendingTotal}
                  icon={<Flag />}
                  tone={pendingTotal > 0 ? 'warning' : 'default'}
                  note={`${formatNumber(data.moderation.pendingCommentReports)} на комментарии, ${formatNumber(
                    data.moderation.pendingProfileReports,
                  )} на профили`}
                />
                <StatCard
                  label="Забанено"
                  value={data.users.banned}
                  icon={<Ban />}
                  tone={data.users.banned > 0 ? 'destructive' : 'default'}
                  note={
                    data.users.total > 0
                      ? `${((data.users.banned / data.users.total) * 100).toFixed(1).replace('.', ',')} % всех аккаунтов`
                      : undefined
                  }
                />
              </StatGrid>

              <DashboardCharts />

              <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
                <PageSection
                  title="Последние действия"
                  description="Журнал аудита: кто и что менял в админке."
                  actions={
                    <Can requirement="audit_log.view">
                      <Button asChild variant="ghost" size="sm">
                        <Link href="/admin/audit-log">Весь журнал</Link>
                      </Button>
                    </Can>
                  }
                >
                  <Card>
                    {data.recentAuditLog.length === 0 ? (
                      <EmptyState
                        size="sm"
                        icon={<ScrollText />}
                        title="Пока пусто"
                        description="Действия администраторов появятся здесь."
                      />
                    ) : (
                      <Timeline>
                        {data.recentAuditLog.map((entry) => (
                          <AuditEntry key={entry.id} entry={entry} />
                        ))}
                      </Timeline>
                    )}
                  </Card>
                </PageSection>

                <PageSection title="Быстрые переходы">
                  <Card className="flex flex-col gap-2">
                    <Can requirement="users.view">
                      <Button asChild variant="secondary" className="justify-start">
                        <Link href="/admin/users">
                          <Users />
                          Пользователи
                          <span className="ml-auto text-xs text-muted-foreground tabular">
                            {formatNumber(data.users.total)}
                          </span>
                        </Link>
                      </Button>
                    </Can>
                    <Can requirement="roles.view">
                      <Button asChild variant="secondary" className="justify-start">
                        <Link href="/admin/roles">
                          <UserPlus />
                          Роли и права
                        </Link>
                      </Button>
                    </Can>
                    <Can requirement="content.view">
                      <Button asChild variant="secondary" className="justify-start">
                        <Link href="/admin/content">
                          <Flag />
                          Контент и жалобы
                          {pendingTotal > 0 ? (
                            <span className="ml-auto text-xs text-warning tabular">
                              {formatNumber(pendingTotal)}{' '}
                              {plural(pendingTotal, { one: 'новая', few: 'новые', many: 'новых' })}
                            </span>
                          ) : null}
                        </Link>
                      </Button>
                    </Can>
                  </Card>
                </PageSection>
              </div>
            </>
          );
        }}
      </QueryBoundary>
    </PermissionGate>
  );
}
