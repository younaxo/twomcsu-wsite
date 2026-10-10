'use client';

import type {
  MeResponse,
  ProfileSocialLinkDto,
  PublicProfileSummary,
  PublicSeasonalSettings,
  SeasonalFallingMode,
  WalletSummaryDto,
} from '@twomc/shared';
import { LogOut } from 'lucide-react';
import { useState } from 'react';
import { LogoutConfirmDialog } from '@/components/auth/logout-confirm';
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
import {
  MiniProfileAdminContent,
  MiniProfileSummary,
  miniProfileAdminClassName,
  miniProfileEntries,
} from '@/components/shell/mini-profile';
import { menuItemClassName } from '@/components/ui/dropdown-menu';
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
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { pickPrimaryRole } from '@/lib/roles/primary-role';
import { getScreenshot, screenshotUrl } from '@/lib/site/project-screenshots';
import {
  SEASONAL_CAMPAIGNS,
  SEASONAL_EFFECTS,
  resolveSeasonalView,
  type SeasonalCampaign,
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
// Баннер — реальный скриншот проекта из реестра (ADR-0096).
const BANNER = screenshotUrl(getScreenshot('spawn-town'), 1280, 'webp');

const me: MeResponse = {
  id: demo.id,
  shortId: 1042,
  tag: demo.tag,
  discriminator: demo.tag.split('#')[1] ?? '0001',
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
  statusText: 'Строю спавн к открытию сезона',
  shortId: 1042,
  tag: demo.tag,
  discriminator: demo.tag.split('#')[1] ?? '0001',
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

const DEMO_ROLE = {
  slug: 'chief-curator',
  displayName: 'Главный куратор',
  priority: 90,
  color: null,
};
const DEMO_STATS = { views: 128, likes: 24, dislikes: 2, myReaction: 'LIKE' as const };
const DEMO_ACCOUNTS: ConnectedAccount[] = [
  { provider: 'discord', name: 'steve_mainer', url: null },
  { provider: 'telegram', name: 'steve_mainer', url: 'https://t.me/steve_mainer' },
  { provider: 'vk', name: 'steve_mainer', url: 'https://vk.com/steve_mainer' },
  {
    provider: 'steam',
    name: 'Steve Mainer',
    url: 'https://steamcommunity.com/profiles/76561198000000000',
  },
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

const WALLET_ZERO: WalletSummaryDto = {
  balances: [
    { currency: 'RUB', amountMinor: '0', scale: 2 },
    { currency: 'RUBY', amountMinor: '0', scale: 0 },
  ],
};
const WALLET_DEMO: WalletSummaryDto = {
  balances: [
    { currency: 'RUB', amountMinor: '125000', scale: 2 },
    { currency: 'RUBY', amountMinor: '1500', scale: 0 },
  ],
};

const adminMe: MeResponse = {
  ...me,
  username: 'Ochen_Dlinnyi_Nik_Admina',
  roles: [
    {
      id: 'role-demo',
      name: 'chief-curator',
      slug: 'chief-curator',
      displayName: 'Главный куратор',
      priority: 90,
      color: null,
      isSuperuser: false,
    },
  ],
};
const adminSummary: PublicProfileSummary = {
  ...summary,
  username: adminMe.username,
  statusText:
    'Очень длинный статус, который не должен ломать шапку mini profile ни на телефоне, ни на компьютере',
  roles: [{ slug: 'chief-curator', displayName: 'Главный куратор', priority: 90, color: null }],
};

/// Та же разметка, что у меню профиля (пункты, admin-блок, «Выйти»), на тех же
/// production-частях: `miniProfileEntries`, `MiniProfileAdminContent`, классы
/// пунктов меню. Настоящий DropdownMenu здесь не открываем: он забирает фокус.
function MiniProfileCard({
  user,
  data,
  wallet,
  admin,
  decoration,
}: {
  user: MeResponse;
  data: PublicProfileSummary;
  wallet: WalletSummaryDto;
  admin: boolean;
  decoration: SeasonalCampaign | null;
}) {
  const [logout, setLogout] = useState(false);
  return (
    <div className="w-80 max-w-full overflow-hidden rounded-lg bg-surface-overlay text-sm shadow-lg">
      <div className="pb-3">
        <MiniProfileSummary
          user={user}
          summary={data}
          wallet={wallet}
          bleed
          decorationCampaign={decoration}
        />
      </div>
      <ul className="border-t border-border-subtle p-1">
        {miniProfileEntries(user.username).map((entry) => (
          <li
            key={entry.key}
            className={cn(
              menuItemClassName,
              entry.href ? 'hover:bg-muted' : 'cursor-not-allowed opacity-50',
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
      {admin ? (
        <div className="border-t border-border-subtle p-1" data-testid="mini-profile-admin">
          <div className={cn(menuItemClassName, miniProfileAdminClassName)}>
            <MiniProfileAdminContent />
          </div>
        </div>
      ) : null}
      <div className="border-t border-border-subtle p-1">
        <button
          type="button"
          className={cn(menuItemClassName, 'w-full hover:bg-muted')}
          onClick={() => setLogout(true)}
        >
          <LogOut aria-hidden className="size-4 text-muted-foreground" />
          Выйти
        </button>
      </div>
      {/* Тот же диалог, что на сайте; в превью выход не выполняется. */}
      <LogoutConfirmDialog
        open={logout}
        onOpenChange={setLogout}
        onConfirm={() => {
          setLogout(false);
          toast.message('Превью: выход не выполняется');
        }}
      />
    </div>
  );
}

const HALLOWEEN = SEASONAL_CAMPAIGNS.find((item) => item.id === 'halloween') ?? null;

/// «Украшение шапки» ON/OFF — то же украшение, что в шапке сайта.
function DecorationToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <SegmentedControl
      size="sm"
      aria-label="Украшение шапки"
      value={value ? 'on' : 'off'}
      onValueChange={(next) => onChange(next === 'on')}
      options={[
        { value: 'on', label: 'Украшение шапки: ON' },
        { value: 'off', label: 'OFF' },
      ]}
    />
  );
}

function MiniProfilePreview() {
  const [decorated, setDecorated] = useState(true);
  const decoration = decorated ? HALLOWEEN : null;
  return (
    <Card
      title="Mini profile"
      note="Баннер с сезонным украшением (тот же флаг и ассет, что у шапки сайта) → аватар и 3D-голова → ОДНА строка [префикс ×1.5] ник#0000 → присутствие → монета и рубин из /wallet → меню → «Админ-панель» только по праву → «Выйти» с подтверждением. Без статуса, внутренних номеров и повторов ника."
    >
      <DecorationToggle value={decorated} onChange={setDecorated} />
      <div className="flex flex-wrap gap-6">
        <div className="flex flex-col gap-2">
          <span className="text-xs text-muted-foreground">Игрок · без админ-блока · честный 0</span>
          <MiniProfileCard
            user={me}
            data={summary}
            wallet={WALLET_ZERO}
            admin={false}
            decoration={decoration}
          />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-xs text-muted-foreground">
            Администратор · длинные ник и роль · пример баланса
          </span>
          <MiniProfileCard
            user={adminMe}
            data={adminSummary}
            wallet={WALLET_DEMO}
            admin
            decoration={decoration}
          />
        </div>
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
              discriminator: '1042',
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
              discriminator: '0007',
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
  const [decorated, setDecorated] = useState(true);
  const decoration = decorated ? HALLOWEEN : null;
  return (
    <Card
      title="Публичный профиль"
      note="Над баннером — сезонное украшение (тот же компонент, что в шапке сайта). На баннере: слева сверху — «Редактировать» (только свой профиль), справа сверху — метрики. Ниже — [префикс] ник ОДНОЙ строкой (тултип префикса — у самой картинки), под ней статус."
    >
      <DecorationToggle value={decorated} onChange={setDecorated} />
      <div className="grid gap-4 xl:grid-cols-2">
        <ProfileHero
          decorationCampaign={decoration}
          titleAs="h3"
          handle={demo.username}
          username={demo.username}
          avatar={demo.avatar}
          banner={BANNER}
          statusText="Строю спавн к открытию сезона"
          stats={{ ...DEMO_STATS, myReaction: null }}
          own
          signedIn
          role={pickPrimaryRole([DEMO_ROLE])}
          badges={['VERIFIED', 'PROJECT_TEAM']}
          mediaBadges={['YOUTUBE']}
        />
        <ProfileHero
          decorationCampaign={decoration}
          titleAs="h3"
          handle="Ochen_Dlinnyi_Nik_Igroka_32"
          username="Ochen_Dlinnyi_Nik_Igroka_32"
          avatar={null}
          banner={null}
          statusText="Очень длинный статус игрока, который обрезается многоточием, а полный текст виден в подсказке"
          stats={DEMO_STATS}
          own={false}
          signedIn={false}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2">
          <ConnectedAccountsSection accounts={DEMO_ACCOUNTS} />
          <p className="text-xs text-muted-foreground">
            Discord — без публичной ссылки (только «Скопировать имя»). Скрытый владельцем провайдер
            и не привязанный сервер в ответ не отдаёт — его здесь нет.
          </p>
        </div>
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
