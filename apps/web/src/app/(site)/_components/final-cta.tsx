'use client';

import { HelpCircle, Play } from 'lucide-react';
import Link from 'next/link';
import { overviewHealth } from '@/components/shell/server-status-button';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';
import { formatNumber, plural } from '@/lib/format';
import { SERVER_ADDRESS } from '@/lib/site/config';
import { useServersOverview } from '@/lib/site/hooks';
import { CopyAddressButton } from './copy-address-button';

const DOT = {
  operational: 'bg-success',
  degraded: 'bg-warning',
  outage: 'bg-destructive',
  unknown: 'bg-border-strong',
} as const;

const TEXT = {
  operational: 'сервера работают',
  degraded: 'часть серверов недоступна',
  outage: 'сервера недоступны',
  unknown: 'статус неизвестен',
} as const;

/// Финальный CTA перед футером: адрес, онлайн, статус и два действия —
/// без generic-фраз.
export function HomeFinalCta() {
  const overview = useServersOverview();
  const health = overviewHealth(overview.data, overview.isError);
  const players = overview.data?.totalPlayers;
  return (
    <section
      id="cta"
      aria-labelledby="cta-title"
      className="flex flex-col items-start gap-6 rounded-xl border bg-surface p-6 shadow-lg edge-highlight md:flex-row md:items-center md:justify-between md:p-10"
    >
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary-soft-foreground">
          Адрес сервера
        </p>
        <h2
          id="cta-title"
          className="mt-1 font-display text-3xl font-bold tracking-tight md:text-5xl"
        >
          <span className="font-mono">{SERVER_ADDRESS}</span>
        </h2>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <span aria-hidden className={cn('size-2 rounded-full', DOT[health])} />
            {overview.isPending ? 'проверяем…' : TEXT[health]}
          </span>
          <span aria-hidden>·</span>
          {overview.isPending ? (
            <Skeleton className="h-4 w-24" />
          ) : players === undefined ? (
            <span>онлайн недоступен</span>
          ) : (
            <span className="tabular">
              {formatNumber(players)}{' '}
              {plural(players, { one: 'игрок', few: 'игрока', many: 'игроков' })} онлайн
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <CopyAddressButton size="lg" label="Начать играть">
          Начать играть
        </CopyAddressButton>
        <Button asChild size="lg" variant="secondary">
          <Link href="#quick-start">
            <HelpCircle />
            Как зайти?
          </Link>
        </Button>
        <Button asChild size="lg" variant="ghost" className="max-md:hidden">
          <Link href="/servers">
            <Play />
            Сервера
          </Link>
        </Button>
      </div>
    </section>
  );
}
