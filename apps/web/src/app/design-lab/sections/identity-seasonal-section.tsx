'use client';

import type {
  MeResponse,
  ProfileSocialLinkDto,
  PublicProfileSummary,
  PublicSeasonalSettings,
  SeasonalFallingMode,
} from '@twomc/shared';
import { useState } from 'react';
import { ProfileBadges } from '@/components/profile/profile-badges';
import { ProfileHeader } from '@/components/profile/profile-header';
import { MinecraftHead } from '@/components/profile/minecraft-head';
import { ProfileHero } from '@/components/profile/profile-hero';
import {
  ConnectedAccountsSection,
  SocialLinksSection,
  type ConnectedAccount,
} from '@/components/profile/profile-links';
import { EffectsCanvas } from '@/components/seasonal/seasonal-effects';
import { SeasonalPreviewFrame } from '@/components/seasonal/seasonal-preview-frame';
import { MiniProfileSummary, miniProfileEntries } from '@/components/shell/mini-profile';
import { SeasonalHeaderDecoration } from '@/components/shell/seasonal-header-decoration';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SwitchField } from '@/components/ui/switch';
import { cn } from '@/lib/cn';
import { HOME_HERO_IMAGES } from '@/lib/site/config';
import {
  SEASONAL_CAMPAIGNS,
  SEASONAL_EFFECTS,
  resolveSeasonalView,
  type SeasonalEffect,
} from '@/lib/site/seasonal';
import { demoUsers } from '../demo-data';

/// «Профиль и сезоны» (ADR-0088–0091): production-компоненты на демо-данных —
/// шапка публичного профиля (свой / чужой), 3D-голова скина, привязанные
/// аккаунты и соцсети, mini profile, шапка профиля с баннером и без, бейджи и
/// украшения, украшение шапки ON/OFF и ошибка ассета, независимые сезон и
/// эффект, падающие эффекты (в т.ч. звёзды Дня Победы). Запросов, меняющих
/// данные, превью не делает (просмотры и оценки шлёт только вошедший на чужом
/// профиле).

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

const DEMO_STATS = { views: 128, likes: 24, dislikes: 2, myReaction: 'LIKE' as const };
const DEMO_ACCOUNTS: ConnectedAccount[] = [
  { provider: 'discord', name: 'steve_mainer' },
  { provider: 'telegram', name: null },
];
const DEMO_SOCIALS: ProfileSocialLinkDto[] = [
  { platform: 'YOUTUBE', value: 'https://youtube.com/@twomc' },
  { platform: 'TWITCH', value: 'https://twitch.tv/steve_mainer' },
  { platform: 'GITHUB', value: 'https://github.com/steve-mainer' },
  { platform: 'WEBSITE', value: 'https://example.com/очень-длинный-адрес-личного-сайта-игрока' },
  { platform: 'VK', value: 'steve_mainer' },
];

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
      <div className="-mx-1 max-w-full overflow-x-auto px-1 pb-1 scrollbar-thin">
        <SegmentedControl
          size="sm"
          aria-label="Эффект"
          value={effect}
          onValueChange={(value) => setEffect(value as SeasonalEffect)}
          options={SEASONAL_EFFECTS.map((item) => ({ value: item.id, label: item.label }))}
        />
      </div>
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

function ProfilePagePreview() {
  return (
    <Card
      title="Публичный профиль"
      note="Свой профиль — круглая «Редактировать» справа сверху, оценить себя нельзя; чужой без входа — оценки заблокированы с подсказкой. Просмотры без своих и дублей."
    >
      <div className="grid gap-4 xl:grid-cols-2">
        <ProfileHero
          titleAs="h3"
          handle={demo.username}
          username={demo.username}
          avatar={demo.avatar}
          banner={BANNER}
          statusText="Строю спавн к открытию сезона"
          stats={{ ...DEMO_STATS, myReaction: null }}
          own
          signedIn
        />
        <ProfileHero
          titleAs="h3"
          handle="Ochen_Dlinnyi_Nik_Igroka_32"
          username="Ochen_Dlinnyi_Nik_Igroka_32"
          avatar={null}
          banner={null}
          stats={DEMO_STATS}
          own={false}
          signedIn={false}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <ConnectedAccountsSection accounts={DEMO_ACCOUNTS} />
        <SocialLinksSection links={DEMO_SOCIALS} />
      </div>
    </Card>
  );
}

function MinecraftHeadPreview() {
  const [nick, setNick] = useState('younaxo_');
  const name = nick.trim();
  return (
    <Card
      title="3D-голова скина"
      note="CSS-куб из текстуры скина (без WebGL), поворот при наведении, без анимации при «уменьшении движения». Скин сайт берёт с серверов Mojang; нет скина — голова не рисуется, остаётся аватар."
    >
      <div className="flex flex-wrap items-end gap-4">
        <Field label="Minecraft-ник" className="w-56 max-w-full">
          <Input
            value={nick}
            spellCheck={false}
            onChange={(event) => setNick(event.target.value)}
          />
        </Field>
        <div className="flex items-end gap-4">
          {name ? <MinecraftHead username={name} size={36} /> : null}
          {name ? <MinecraftHead username={name} size={64} /> : null}
        </div>
      </div>
    </Card>
  );
}

function SeasonMatrixPreview() {
  const [campaignId, setCampaignId] = useState('victory-day');
  const [seasonOn, setSeasonOn] = useState(true);
  const [mode, setMode] = useState<SeasonalFallingMode>('season');
  const [effect, setEffect] = useState<SeasonalEffect>('snow');
  const campaign = SEASONAL_CAMPAIGNS.find((item) => item.id === campaignId) ?? null;
  const now = new Date();
  const settings: PublicSeasonalSettings = {
    enabled: true,
    mode: 'forced',
    forcedCampaignId: campaign?.id ?? null,
    showWordmarkO: true,
    showDecoration: true,
    showEffects: mode !== 'off',
    showBanners: true,
    effectIntensity: 2,
    fallingMode: mode,
    fallingEffect: effect,
    effectSpeed: 2,
    campaigns: {},
    serverTime: now.toISOString(),
  };
  const view = resolveSeasonalView(settings, now, { campaign, season: seasonOn });
  return (
    <Card
      title="Сезон и эффект — независимо"
      note="Оформление сезона («o», украшение шапки, баннеры) и падающий эффект — разные флаги: эффект можно включить без сезона («Всегда»), сезон — без эффекта («Выключен»). Тот же расчёт и та же рамка, что в админке."
    >
      <div className="grid gap-4 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-3">
          <Select value={campaignId} onValueChange={setCampaignId}>
            <SelectTrigger size="sm" aria-label="Кампания">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Без сезона</SelectItem>
              {SEASONAL_CAMPAIGNS.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <SwitchField
            label="Оформление сезона"
            description="«o», украшение шапки, баннеры"
            checked={seasonOn}
            onCheckedChange={setSeasonOn}
          />
          <div className="max-w-full overflow-x-auto pb-1 scrollbar-thin">
            <SegmentedControl
              size="sm"
              aria-label="Падающий эффект"
              value={mode}
              onValueChange={(value) => setMode(value as SeasonalFallingMode)}
              options={[
                { value: 'season', label: 'По сезону' },
                { value: 'always', label: 'Всегда' },
                { value: 'off', label: 'Выключен' },
              ]}
            />
          </div>
          {mode === 'always' ? (
            <Select value={effect} onValueChange={(value) => setEffect(value as SeasonalEffect)}>
              <SelectTrigger size="sm" aria-label="Тип эффекта">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEASONAL_EFFECTS.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
        <SeasonalPreviewFrame view={view} />
      </div>
    </Card>
  );
}

export function IdentitySeasonalSection() {
  return (
    <div className="flex flex-col gap-10">
      <ProfilePagePreview />
      <MinecraftHeadPreview />
      <div className="grid gap-8 lg:grid-cols-[auto_minmax(0,1fr)]">
        <MiniProfilePreview />
        <div className="flex min-w-0 flex-col gap-8">
          <HeaderPreview />
          <BadgesPreview />
        </div>
      </div>
      <HeaderDecorationPreview />
      <SeasonMatrixPreview />
      <EffectsPreview />
    </div>
  );
}
