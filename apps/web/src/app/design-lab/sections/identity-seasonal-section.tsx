'use client';

import type { MeResponse, PublicProfileSummary } from '@twomc/shared';
import { useState } from 'react';
import { ProfileBadges } from '@/components/profile/profile-badges';
import { ProfileHeader } from '@/components/profile/profile-header';
import { EffectsCanvas } from '@/components/seasonal/seasonal-effects';
import { MiniProfileSummary, miniProfileEntries } from '@/components/shell/mini-profile';
import { SeasonalHeaderDecoration } from '@/components/shell/seasonal-header-decoration';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { cn } from '@/lib/cn';
import { HOME_HERO_IMAGES } from '@/lib/site/config';
import { SEASONAL_CAMPAIGNS, SEASONAL_EFFECTS, type SeasonalEffect } from '@/lib/site/seasonal';
import { demoUsers } from '../demo-data';

/// «Профиль и сезоны» (ADR-0088–0090): production-компоненты на демо-данных —
/// mini profile, шапка профиля с баннером и без, бейджи и украшения, украшение
/// шапки ON/OFF и ошибка ассета, падающие эффекты (в т.ч. звёзды Дня Победы).

const demo = demoUsers[0]!;
// Баннер — реальный скриншот проекта из конфига главной (если задан).
const BANNER = HOME_HERO_IMAGES[0] ?? null;

const me: MeResponse = {
  id: demo.id,
  shortId: 1042,
  tag: demo.tag,
  email: 'demo@twomc.su',
  username: demo.username,
  avatar: demo.avatar,
  banner: BANNER,
  accountType: 'DEFAULT',
  accessLevel: 0,
  mustChangePassword: false,
  roles: [],
  permissions: { superuser: false, permissions: [], maxPriority: null },
};

const summary: PublicProfileSummary = {
  username: demo.username,
  hidden: false,
  shortId: 1042,
  tag: demo.tag,
  avatar: demo.avatar,
  banner: BANNER,
  decoration: { slug: 'demo', name: 'Пример украшения', imageUrl: null },
  badges: ['VERIFIED', 'PROJECT_TEAM'],
  mediaBadges: ['YOUTUBE'],
  createdAt: demo.joinedAt,
  system: false,
  banned: false,
  position: null,
  roles: [],
  online: true,
  currentServer: 'Выживание',
  lastActivityAt: null,
  statistics: {
    playTimeMinutes: demo.playtimeHours * 60,
    kills: 37,
    deaths: 12,
    killDeathRatio: 3.08,
  },
  statisticsHidden: false,
  friendsCount: 24,
  achievementsCompleted: 11,
};

function Card({
  title,
  note,
  children,
  className,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-3', className)}>
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
      </div>
      {children}
    </div>
  );
}

function MiniProfilePreview() {
  return (
    <Card
      title="Mini profile"
      note="Шапка → статистика → меню. Desktop — меню-popover, mobile — bottom sheet с тем же содержимым."
    >
      <div className="w-80 max-w-full overflow-hidden rounded-lg bg-surface-overlay shadow-lg">
        <div className="pb-3">
          <MiniProfileSummary user={me} summary={summary} loading={false} bleed />
        </div>
        <ul className="border-t border-border-subtle p-1 text-sm">
          {miniProfileEntries(me.username, true).map((entry) => (
            <li
              key={entry.key}
              className={cn(
                'flex h-control-sm items-center gap-2 rounded-sm px-2',
                entry.href ? '' : 'cursor-not-allowed opacity-50',
              )}
            >
              <entry.icon aria-hidden className="size-4 text-muted-foreground" />
              {entry.label}
              {entry.href ? null : (
                <span className="ml-auto text-xs text-subtle-foreground">скоро</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

function HeaderPreview() {
  return (
    <Card
      title="Avatar + Banner"
      note="Реальный баннер или нейтральная поверхность — без случайных градиентов и битых картинок."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="overflow-hidden rounded-lg bg-surface-overlay pb-3 shadow-sm">
          <ProfileHeader
            bleed
            identity={{
              username: demo.username,
              shortId: 1042,
              avatar: demo.avatar,
              banner: BANNER,
              presence: { online: true, currentServer: 'Выживание', lastActivityAt: null },
            }}
          />
        </div>
        <div className="overflow-hidden rounded-lg bg-surface-overlay pb-3 shadow-sm">
          <ProfileHeader
            bleed
            identity={{
              username: 'Без_Баннера_И_С_Очень_Длинным_Ником',
              shortId: 7,
              avatar: null,
              banner: null,
              presence: { online: false, currentServer: null, lastActivityAt: null },
            }}
          />
        </div>
      </div>
    </Card>
  );
}

function BadgesPreview() {
  return (
    <Card
      title="Badges / Decorations"
      note="Бейджи, медиа-бейджи и украшение — подсказки по наведению и фокусу."
    >
      <ProfileBadges
        badges={['LEADERSHIP', 'VERIFIED', 'SUBSCRIBER_PLUS', 'PROJECT_TEAM', 'DEVELOPERS_TEAM']}
        mediaBadges={['YOUTUBE', 'TWITCH', 'TIKTOK']}
        decoration={{ slug: 'demo', name: 'Пример украшения', imageUrl: null }}
      />
    </Card>
  );
}

function HeaderDecorationPreview() {
  const halloween = SEASONAL_CAMPAIGNS.find((item) => item.id === 'halloween') ?? null;
  const broken = halloween?.headerDecoration
    ? {
        ...halloween,
        headerDecoration: { ...halloween.headerDecoration, src: '/assets/seasonal/missing.webp' },
      }
    : null;
  const strip = (label: string, campaign: typeof halloween, preview = false) => (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="relative flex h-12 items-center rounded-lg bg-surface px-3 shadow-sm">
        <SeasonalHeaderDecoration
          campaign={campaign}
          preview={preview}
          className="h-3 rounded-t-lg md:h-3"
        />
        <span className="relative z-[1] text-sm font-semibold">twomc.su</span>
      </div>
    </div>
  );
  return (
    <Card
      title="Header Decoration"
      note="Свой флаг, не зависит от падающего эффекта. Ассет проверяется загрузкой: ошибка в превью — явная."
    >
      <div className="grid gap-3 sm:grid-cols-3">
        {strip('ON — Хэллоуин', halloween)}
        {strip('OFF', null)}
        {strip('Ассет не загрузился (превью)', broken, true)}
      </div>
    </Card>
  );
}

function EffectsPreview() {
  const [effect, setEffect] = useState<SeasonalEffect>('stars');
  return (
    <Card
      title="Seasonal effects"
      note="Один движок на canvas; «Красные звёзды» — День Победы. Не перехватывают клики, с «уменьшением движения» выключены."
    >
      <SegmentedControl
        size="sm"
        aria-label="Эффект"
        value={effect}
        onValueChange={(value) => setEffect(value as SeasonalEffect)}
        options={SEASONAL_EFFECTS.map((item) => ({ value: item.id, label: item.label }))}
      />
      <div
        className="relative h-56 overflow-hidden rounded-lg bg-background shadow-sm"
        data-testid="effects-preview"
      >
        <EffectsCanvas contained effects={[effect]} intensity={2} speed={2} />
        <p className="relative p-4 text-sm text-muted-foreground">
          Текст поверх эффекта остаётся читаемым, кнопки — нажимаемыми.
        </p>
      </div>
    </Card>
  );
}

export function IdentitySeasonalSection() {
  return (
    <div className="flex flex-col gap-10">
      <div className="grid gap-8 lg:grid-cols-[auto_minmax(0,1fr)]">
        <MiniProfilePreview />
        <div className="flex min-w-0 flex-col gap-8">
          <HeaderPreview />
          <BadgesPreview />
        </div>
      </div>
      <HeaderDecorationPreview />
      <EffectsPreview />
    </div>
  );
}
