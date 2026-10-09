'use client';

import { RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/admin/page-header';
import { QueryBoundary } from '@/components/admin/query-boundary';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Progress } from '@/components/ui/progress';
import { formatNumber } from '@/lib/format';
import { useServersOverview } from '@/lib/site/hooks';

/// Сервера проекта — реальный Server List Ping (GET /servers/overview).
export default function ServersPage() {
  const overview = useServersOverview();
  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-8 px-4 py-8 md:px-6">
      <PageHeader
        title="Сервера"
        description={
          overview.data
            ? `${formatNumber(overview.data.totalPlayers)} игроков онлайн · ${overview.data.onlineServers} из ${overview.data.totalServers} серверов работают`
            : 'Проверяем состояние серверов…'
        }
        actions={
          <Button
            variant="secondary"
            size="sm"
            loading={overview.isFetching}
            onClick={() => overview.refetch()}
          >
            <RefreshCw />
            Обновить
          </Button>
        }
      />
      <QueryBoundary query={overview}>
        {(data) =>
          data.servers.length === 0 ? (
            <EmptyState
              title="Серверов пока нет"
              description="Список появится, когда администрация добавит сервера."
            />
          ) : (
            <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data.servers.map((server) => {
                const fill =
                  server.maxPlayers > 0 ? (server.playerCount / server.maxPlayers) * 100 : 0;
                return (
                  <li key={server.id}>
                    <Card className="flex h-full flex-col gap-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h2 className="truncate text-lg font-semibold">{server.name}</h2>
                          {server.motd ? (
                            <p className="truncate text-sm text-muted-foreground">{server.motd}</p>
                          ) : null}
                        </div>
                        <StatusBadge status={server.online ? 'online' : 'offline'} />
                      </div>
                      <div className="flex items-end justify-between gap-2">
                        <p className="font-display text-2xl font-bold tabular">
                          {formatNumber(server.playerCount)}
                          <span className="text-sm font-normal text-muted-foreground">
                            {' '}
                            / {formatNumber(server.maxPlayers)}
                          </span>
                        </p>
                        {server.version ? (
                          <span className="font-mono text-xs text-subtle-foreground">
                            {server.version}
                          </span>
                        ) : null}
                      </div>
                      <Progress
                        value={server.online ? fill : 0}
                        label={`Заполненность ${server.name}`}
                        size="sm"
                      />
                    </Card>
                  </li>
                );
              })}
            </ul>
          )
        }
      </QueryBoundary>
    </div>
  );
}
