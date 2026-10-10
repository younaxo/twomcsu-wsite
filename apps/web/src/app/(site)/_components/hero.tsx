'use client';

import { ArrowDown, Play } from 'lucide-react';
import Link from 'next/link';
import { BrandWordmark } from '@/components/shell/brand-wordmark';
import { overviewHealth } from '@/components/shell/server-status-button';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';
import { formatNumber, plural } from '@/lib/format';
import {
  HOME_HERO_SHOTS,
  SERVER_ADDRESS,
  SITE_DESCRIPTION,
  SUPPORTED_VERSIONS,
} from '@/lib/site/config';
import { useServersOverview } from '@/lib/site/hooks';
import { CopyAddressButton } from './copy-address-button';
import { ScreenshotPicture } from '@/components/site/screenshot-picture';
import { getScreenshot, type ProjectScreenshot } from '@/lib/site/project-screenshots';

const HEALTH_LABEL = {
  operational: { text: 'Все сервера работают', dot: 'bg-success' },
  degraded: { text: 'Часть серверов недоступна', dot: 'bg-warning' },
  outage: { text: 'Сервера недоступны', dot: 'bg-destructive' },
  unknown: { text: 'Статус неизвестен', dot: 'bg-border-strong' },
} as const;

/// Версии из реального ping/настроек серверов (дополняют строку владельца
/// SUPPORTED_VERSIONS, если она не задана).
export function collectVersions(
  servers: { version?: string | null; configuredVersion?: string | null }[] | undefined,
): string[] {
  if (!servers) return [];
  const set = new Set<string>();
  for (const server of servers) {
    const value = (server.configuredVersion || server.version || '').trim();
    if (value) set.add(value);
  }
  return [...set];
}

function Stat({
  label,
  value,
  pending,
  children,
}: {
  label: string;
  value?: React.ReactNode;
  pending?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-subtle-foreground">{label}</p>
      {pending ? (
        <Skeleton className="h-7 w-20" />
      ) : (
        <div className="min-w-0 font-display text-xl font-bold leading-tight tabular">{value}</div>
      )}
      {children}
    </div>
  );
}

/// Первый экран: название, суть проекта, живой онлайн и статус по реальному
/// ping, адрес, версии, кнопки «Начать играть» и «Скопировать IP».
/// Изображения — реальные скриншоты сервера из реестра (HOME_HERO_SHOTS).
export function HomeHero() {
  const overview = useServersOverview();
  const players = overview.data?.totalPlayers;
  const health = overviewHealth(overview.data, overview.isError);
  const versions = collectVersions(overview.data?.servers);
  const [primaryShot, secondaryShot] = HOME_HERO_SHOTS.map(getScreenshot) as [
    ProjectScreenshot,
    ProjectScreenshot,
  ];

  return (
    <section
      id="hero"
      aria-labelledby="hero-title"
      className="grid gap-8 lg:grid-cols-[1.15fr_1fr] lg:items-center"
    >
      <div className="flex flex-col gap-6">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border bg-surface px-3 py-1 text-xs font-medium text-muted-foreground">
            <span aria-hidden className={cn('size-2 rounded-full', HEALTH_LABEL[health].dot)} />
            {overview.isPending ? 'Проверяем сервера…' : HEALTH_LABEL[health].text}
          </p>
          <h1 id="hero-title" className="mt-4">
            <BrandWordmark size="xl" />
          </h1>
          <p className="mt-4 max-w-prose text-lg text-muted-foreground md:text-xl">
            {SITE_DESCRIPTION}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="Онлайн"
            pending={overview.isPending}
            value={
              players === undefined ? (
                '—'
              ) : (
                <span data-testid="hero-online">
                  {formatNumber(players)}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">
                    {plural(players, { one: 'игрок', few: 'игрока', many: 'игроков' })}
                  </span>
                </span>
              )
            }
          />
          <Stat
            label="Статус"
            pending={overview.isPending}
            value={
              overview.data ? `${overview.data.onlineServers} / ${overview.data.totalServers}` : '—'
            }
          >
            <p className="text-xs text-muted-foreground">серверов онлайн</p>
          </Stat>
          <Stat
            label="IP"
            value={
              <span className="truncate font-mono text-base" data-testid="hero-address">
                {SERVER_ADDRESS}
              </span>
            }
          />
          <Stat
            label="Версии"
            value={
              <span className="font-mono text-base" data-testid="hero-versions">
                {SUPPORTED_VERSIONS || versions.join(', ') || 'уточняется'}
              </span>
            }
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="#quick-start">
              <Play />
              Начать играть
            </Link>
          </Button>
          <CopyAddressButton size="lg" variant="secondary" />
          <Button asChild variant="ghost" size="lg" className="text-muted-foreground">
            <Link href="#showcase">
              <ArrowDown />
              Что внутри
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3" data-testid="hero-media">
        {/* Реальные скриншоты сервера (ADR-0096): крупный — над сгибом. */}
        <figure className="relative aspect-[16/10] overflow-hidden rounded-xl border bg-surface-sunken shadow-lg">
          <ScreenshotPicture
            shot={primaryShot}
            priority
            sizes="(min-width: 1024px) 45vw, 100vw"
            className="absolute inset-0 size-full"
          />
        </figure>
        <figure className="relative aspect-[21/9] overflow-hidden rounded-xl border bg-surface-sunken">
          <ScreenshotPicture
            shot={secondaryShot}
            sizes="(min-width: 1024px) 45vw, 100vw"
            className="absolute inset-0 size-full"
          />
        </figure>
      </div>
    </section>
  );
}
