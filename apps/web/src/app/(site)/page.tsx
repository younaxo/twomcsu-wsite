'use client';

import { ArrowRight, Server, ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatNumber, plural } from '@/lib/format';
import { SITE_NAME, SITE_TAGLINE } from '@/lib/site/config';
import { useServersOverview } from '@/lib/site/hooks';

/// Главная публичного сайта: live-онлайн по реальному ping серверов и
/// переходы в разделы. Полноценная главная (новости, события) — PHASE 31.
export default function HomePage() {
  const overview = useServersOverview();
  const players = overview.data?.totalPlayers;
  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-10 px-4 py-10 md:px-6 md:py-16">
      <section className="grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-end">
        <div>
          <p className="text-sm font-medium text-primary-soft-foreground">{SITE_TAGLINE}</p>
          <h1 className="mt-2 font-display text-4xl font-bold tracking-tight md:text-6xl">
            {SITE_NAME}
          </h1>
          <p className="mt-4 max-w-prose text-lg text-muted-foreground">
            Minecraft-проект с собственными серверами, магазином и сообществом. Сейчас на серверах{' '}
            {players === undefined ? (
              <Skeleton className="inline-block h-5 w-12 align-middle" />
            ) : (
              <span className="font-semibold text-foreground tabular">
                {formatNumber(players)}{' '}
                {plural(players, { one: 'игрок', few: 'игрока', many: 'игроков' })}
              </span>
            )}
            .
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/servers">
                <Server />
                Начать играть
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link href="/shop">
                <ShoppingBag />
                Магазин
              </Link>
            </Button>
          </div>
        </div>
        <Card className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">Сервера онлайн</p>
          {overview.isPending ? (
            <Skeleton className="h-9 w-24" />
          ) : (
            <p className="font-display text-3xl font-bold tabular">
              {overview.data
                ? `${overview.data.onlineServers} / ${overview.data.totalServers}`
                : '—'}
            </p>
          )}
          <Link
            href="/servers"
            className="inline-flex items-center gap-1 text-sm text-primary-soft-foreground hover:underline"
          >
            Все сервера
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </Card>
      </section>
    </div>
  );
}
