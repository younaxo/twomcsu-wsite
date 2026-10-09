'use client';

import type { ServerOverviewItem } from '@twomc/shared';
import { ArrowRight, Server } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import { SERVER_ADDRESS } from '@/lib/site/config';
import { useServersOverview } from '@/lib/site/hooks';
import { CopyAddressButton } from './copy-address-button';
import { HomeSection } from './section';

function ServerCard({ server, featured }: { server: ServerOverviewItem; featured: boolean }) {
  const fill = server.maxPlayers > 0 ? (server.playerCount / server.maxPlayers) * 100 : 0;
  const version = server.configuredVersion || server.version;
  const address = server.address || SERVER_ADDRESS;
  return (
    <article
      data-testid="home-server-card"
      className={cn(
        'flex flex-col overflow-hidden rounded-xl border bg-surface shadow edge-highlight',
        featured ? 'md:grid md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]' : '',
      )}
    >
      <div
        className={cn(
          'relative flex items-center justify-center bg-surface-sunken',
          featured ? 'aspect-[16/9] md:aspect-auto md:min-h-[320px]' : 'aspect-[16/8]',
        )}
      >
        {server.iconUrl ? (
          <Image
            src={server.iconUrl}
            alt={server.name}
            fill
            sizes={featured ? '(min-width: 768px) 55vw, 100vw' : '(min-width: 768px) 33vw, 100vw'}
            className="object-cover"
          />
        ) : (
          <Server aria-hidden className="size-14 text-subtle-foreground" strokeWidth={1.5} />
        )}
      </div>
      <div className="flex flex-col gap-4 p-5 md:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {server.type ? (
              <p className="text-xs font-medium uppercase tracking-wide text-subtle-foreground">
                {server.type}
              </p>
            ) : null}
            <h3
              className={cn(
                'truncate font-display font-semibold',
                featured ? 'text-2xl' : 'text-lg',
              )}
            >
              {server.name}
            </h3>
          </div>
          <StatusBadge status={server.online ? 'online' : 'offline'} />
        </div>
        {server.description || server.motd ? (
          <p className="line-clamp-3 text-sm text-muted-foreground">
            {server.description || server.motd}
          </p>
        ) : null}
        <div className="flex items-end justify-between gap-3">
          <p className="font-display text-2xl font-bold tabular">
            {formatNumber(server.playerCount)}
            <span className="text-sm font-normal text-muted-foreground">
              {' '}
              / {formatNumber(server.maxPlayers)}
            </span>
          </p>
          {version ? (
            <span className="font-mono text-xs text-subtle-foreground">{version}</span>
          ) : null}
        </div>
        <Progress
          value={server.online ? fill : 0}
          label={`Заполненность ${server.name}`}
          size="sm"
        />
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          <CopyAddressButton address={address} size="sm" label={`Скопировать ${address}`}>
            {address}
          </CopyAddressButton>
          <Button asChild variant="ghost" size="sm">
            <Link href="/servers">
              Подробнее
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </div>
    </article>
  );
}

/// Живой блок серверов — реальный Server List Ping. Один сервер — одна
/// большая карточка; несуществующие сервера не придумываются.
export function HomeServers() {
  const overview = useServersOverview();
  const servers = overview.data?.servers ?? [];
  return (
    <HomeSection
      id="servers"
      eyebrow="Сервера"
      title="Где играть"
      description={
        overview.data
          ? `${overview.data.onlineServers} из ${overview.data.totalServers} серверов онлайн, ${formatNumber(overview.data.totalPlayers)} игроков прямо сейчас.`
          : undefined
      }
      action={
        <Button asChild variant="secondary" size="sm">
          <Link href="/servers">
            Все сервера
            <ArrowRight />
          </Link>
        </Button>
      }
    >
      {overview.isPending ? (
        <Skeleton className="h-72 w-full rounded-xl" />
      ) : overview.isError ? (
        <EmptyState
          icon={<Server />}
          title="Не удалось опросить сервера"
          description="Попробуйте обновить страницу чуть позже."
        />
      ) : servers.length === 0 ? (
        <EmptyState
          icon={<Server />}
          title="Серверов пока нет"
          description="Список появится, когда администрация добавит сервера."
        />
      ) : servers.length === 1 ? (
        <ServerCard server={servers[0]} featured />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {servers.map((server) => (
            <ServerCard key={server.id} server={server} featured={false} />
          ))}
        </div>
      )}
    </HomeSection>
  );
}
