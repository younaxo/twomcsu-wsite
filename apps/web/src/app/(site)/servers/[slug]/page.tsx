'use client';

import { ServerOff, Users } from 'lucide-react';
import { useParams } from 'next/navigation';
import { QueryBoundary } from '@/components/admin/query-boundary';
import { ModuleGate } from '@/components/system/site-availability';
import { StatusBadge } from '@/components/ui/badge';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api/errors';
import { formatDateTime, formatNumber } from '@/lib/format';
import {
  chronological,
  connectAddress,
  useServerCard,
  useServerHistory,
  useServerPlayers,
  useServerStatus,
  type ServerHistoryPoint,
} from '@/lib/site/server-detail';
import { CopyAddressButton } from '../../_components/copy-address-button';

const CHART_W = 600;
const CHART_H = 140;

/// Онлайн по замерам: сплошная линия без градиентов и размытия.
/// Доступная альтернатива — текстовая сводка (минимум, максимум, замеров).
function OnlineChart({ points }: { points: ServerHistoryPoint[] }) {
  const data = chronological(points);
  if (data.length < 2) {
    return (
      <EmptyState
        title="Истории пока мало"
        description="График появится, когда накопится хотя бы два замера."
      />
    );
  }
  const counts = data.map((point) => point.playerCount);
  const max = Math.max(...counts, 1);
  const min = Math.min(...counts);
  const x = (index: number) => (index / (data.length - 1)) * CHART_W;
  const y = (value: number) => CHART_H - 8 - (value / max) * (CHART_H - 16);
  const line = data
    .map(
      (point, index) =>
        `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)} ${y(point.playerCount).toFixed(1)}`,
    )
    .join(' ');
  return (
    <figure className="flex flex-col gap-2" data-testid="online-chart">
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        role="img"
        aria-label={`График онлайна: от ${min} до ${max} игроков, замеров ${data.length}`}
        className="h-36 w-full text-primary"
        preserveAspectRatio="none"
      >
        <line
          x1="0"
          x2={CHART_W}
          y1={CHART_H - 8}
          y2={CHART_H - 8}
          className="stroke-border"
          strokeWidth="1"
        />
        <path
          d={line}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <figcaption className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
        <span>{formatDateTime(data[0]!.timestamp)}</span>
        <span className="tabular">
          Минимум {formatNumber(min)} · максимум {formatNumber(max)} · замеров {data.length}
        </span>
        <span>{formatDateTime(data[data.length - 1]!.timestamp)}</span>
      </figcaption>
    </figure>
  );
}

function DetailSkeleton() {
  return (
    <div role="status" data-testid="server-skeleton" className="flex flex-col gap-4">
      <span className="sr-only">Загрузка сервера…</span>
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  );
}

function ServerDetailContent() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? '';
  const card = useServerCard(slug);
  const known = card.isSuccess;
  const status = useServerStatus(slug, known);
  const players = useServerPlayers(slug, known);
  const history = useServerHistory(slug, known);

  if (card.isError && card.error instanceof ApiError && card.error.status === 404) {
    return (
      <EmptyState
        icon={<ServerOff />}
        title="Сервер не найден"
        description="Такого сервера нет или он отключён администрацией."
      />
    );
  }

  return (
    <QueryBoundary query={card} skeleton={<DetailSkeleton />}>
      {(server) => {
        const live = status.data;
        const fill = live && live.maxPlayers > 0 ? (live.playerCount / live.maxPlayers) * 100 : 0;
        const address = connectAddress(server);
        return (
          <>
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="font-display text-2xl font-bold md:text-3xl">{server.name}</h1>
                {server.description ? (
                  <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                    {server.description}
                  </p>
                ) : null}
              </div>
              {live ? <StatusBadge status={live.online ? 'online' : 'offline'} /> : null}
            </header>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold">Сейчас</h2>
                {status.isPending ? (
                  <Skeleton className="h-16 w-full" />
                ) : status.isError ? (
                  <ErrorState
                    error={status.error}
                    size="sm"
                    onRetry={() => status.refetch()}
                    retrying={status.isFetching}
                  />
                ) : (
                  <>
                    <p className="font-display text-3xl font-bold tabular">
                      {formatNumber(status.data.playerCount)}
                      <span className="text-sm font-normal text-muted-foreground">
                        {' '}
                        / {formatNumber(status.data.maxPlayers)}
                      </span>
                    </p>
                    <Progress
                      value={status.data.online ? fill : 0}
                      label={`Заполненность ${server.name}`}
                      size="sm"
                    />
                    <dl className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <div>
                        <dt>Версия</dt>
                        <dd className="font-mono text-foreground">
                          {status.data.version ?? server.version ?? '—'}
                        </dd>
                      </div>
                      <div>
                        <dt>Отклик</dt>
                        <dd className="tabular text-foreground">
                          {status.data.ping !== null ? `${status.data.ping} мс` : '—'}
                        </dd>
                      </div>
                    </dl>
                  </>
                )}
              </Card>

              <Card className="flex flex-col gap-3 lg:col-span-2">
                <h2 className="text-sm font-semibold">Как зайти</h2>
                <p className="text-sm text-muted-foreground">
                  Добавьте сервер в Minecraft по адресу:
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <code
                    data-testid="server-address"
                    className="rounded-md bg-surface-sunken px-3 py-2 font-mono text-sm"
                  >
                    {address}
                  </code>
                  <CopyAddressButton address={address} />
                </div>
              </Card>
            </div>

            <Card className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold">Онлайн по замерам</h2>
              {history.isPending ? (
                <Skeleton className="h-36 w-full" />
              ) : history.isError ? (
                <ErrorState
                  error={history.error}
                  size="sm"
                  onRetry={() => history.refetch()}
                  retrying={history.isFetching}
                />
              ) : (
                <OnlineChart points={history.data} />
              )}
            </Card>

            <Card className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold">Игроки онлайн</h2>
              {players.isPending ? (
                <Skeleton className="h-10 w-full" />
              ) : players.isError ? (
                <ErrorState
                  error={players.error}
                  size="sm"
                  onRetry={() => players.refetch()}
                  retrying={players.isFetching}
                />
              ) : players.data.length === 0 ? (
                <EmptyState
                  icon={<Users />}
                  title="Список недоступен или пуст"
                  description="Сервер может не отдавать ники игроков или сейчас никого нет."
                />
              ) : (
                <ul className="flex flex-wrap gap-2" data-testid="server-players">
                  {players.data.map((name) => (
                    <li
                      key={name}
                      className="rounded-md bg-surface-sunken px-2 py-1 font-mono text-xs"
                    >
                      {name}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        );
      }}
    </QueryBoundary>
  );
}

/// Страница сервера (модуль «minecraft»): карточка, статус, график онлайна, игроки.
export default function ServerDetailPage() {
  return (
    <ModuleGate module="minecraft">
      <div className="mx-auto flex max-w-[1100px] flex-col gap-6 px-4 py-8 md:px-6">
        <Breadcrumbs items={[{ label: 'Сервера', href: '/servers' }, { label: 'Сервер' }]} />
        <ServerDetailContent />
      </div>
    </ModuleGate>
  );
}
