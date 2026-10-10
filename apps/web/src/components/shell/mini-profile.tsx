'use client';

import type {
  MeResponse,
  PublicProfileSummary,
  WalletCurrency,
  WalletSummaryDto,
} from '@twomc/shared';
import {
  Heart,
  LifeBuoy,
  MessageSquare,
  Package,
  Settings,
  ShieldCheck,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { identityFromSummary } from '@/components/profile/profile-preview';
import { ProfileHeader, type ProfileIdentityView } from '@/components/profile/profile-header';
import { CurrencyIcon } from '@/components/ui/currency-icon';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMinorUnits } from '@/lib/format';
import type { SeasonalCampaign } from '@/lib/site/seasonal';
import { pickPrimaryRole } from '@/lib/roles/primary-role';

/// Mini profile (ADR-0088, ADR-0093): шапка с баннером, аватаром, ником, ID,
/// небольшим префиксом роли, статусом, бейджами и присутствием → баланс и
/// рубины → меню аккаунта → отдельный блок «Админ-панель» (только по праву) →
/// «Выйти». Один источник данных для popover (desktop) и bottom sheet
/// (mobile): `/auth/me` даёт шапку сразу, summary профиля — бейджи, статус и
/// присутствие, `/wallet` — баланс.

export interface MiniProfileEntry {
  key: string;
  label: string;
  icon: LucideIcon;
  /// Нет href — раздел ещё не готов: пункт недоступен с пометкой «скоро».
  href: string | null;
  /// Счётчик справа (новые заявки в друзья); 0 и нет — без бейджа.
  badge?: number;
}

export function miniProfileEntries(
  username: string,
  counts: { friendRequests?: number } = {},
): MiniProfileEntry[] {
  return [
    {
      key: 'profile',
      label: 'Мой профиль',
      icon: UserRound,
      href: `/u/${encodeURIComponent(username)}`,
    },
    { key: 'settings', label: 'Настройки', icon: Settings, href: '/settings' },
    {
      key: 'friends',
      label: 'Друзья',
      icon: Users,
      href: '/friends',
      badge: counts.friendRequests,
    },
    // Разделы волн Social (2) и Store (4) — появятся вместе с функцией.
    { key: 'messages', label: 'Сообщения', icon: MessageSquare, href: '/messages' },
    { key: 'support', label: 'Обращения', icon: LifeBuoy, href: '/support' },
    { key: 'favorites', label: 'Избранное', icon: Heart, href: null },
    { key: 'orders', label: 'Заказы', icon: Package, href: null },
  ];
}

/// Вход в админку — отдельный административный блок (не пункт общего меню).
/// Показывается только при effective-праве входа (`ADMIN_ENTRY_REQUIREMENT`).
export const MINI_PROFILE_ADMIN = {
  label: 'Админ-панель',
  description: 'Администрирование twomc.su',
  href: '/admin',
} as const;

/// Содержимое пункта «Админ-панель»: красный admin-акцент (не danger) —
/// иконка на мягкой красной подложке, подпись вторичным текстом.
export function MiniProfileAdminContent() {
  return (
    <>
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-md bg-admin-soft text-admin"
      >
        <ShieldCheck className="size-4" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{MINI_PROFILE_ADMIN.label}</span>
        <span className="truncate text-xs text-muted-foreground">
          {MINI_PROFILE_ADMIN.description}
        </span>
      </span>
    </>
  );
}

/// Классы пункта админ-блока поверх обычного пункта меню: выше, со своей
/// мягкой красной подсветкой при наведении и фокусе.
export const miniProfileAdminClassName =
  'h-auto min-h-11 gap-3 py-1.5 hover:bg-admin-soft/60 focus:bg-admin-soft/70';

/// Шапка из `/auth/me` — пока summary не пришёл (или недоступен).
export function identityFromMe(user: MeResponse): ProfileIdentityView {
  return {
    username: user.username,
    discriminator: user.discriminator,
    tag: user.tag,
    avatar: user.avatar,
    banner: user.banner,
    role: pickPrimaryRole(user.roles),
    presence: null,
  };
}

function CompactStat({
  label,
  value,
  icon,
  testId,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  testId: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5" data-testid={testId}>
      <dt className="truncate text-[11px] text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1 text-base font-semibold leading-tight tabular-nums">
        {icon}
        <span className="truncate">{value}</span>
      </dd>
    </div>
  );
}

/// Сумма валюты из ответа `/wallet`; нет ответа (ошибка) — «—», не ноль.
export function walletAmount(wallet: WalletSummaryDto | undefined, currency: WalletCurrency) {
  const entry = wallet?.balances?.find((item) => item.currency === currency);
  if (!entry) return '—';
  const amount = formatMinorUnits(entry.amountMinor, entry.scale);
  return currency === 'RUB' ? `${amount} ₽` : amount;
}

export function MiniProfileSummary({
  user,
  summary,
  wallet,
  walletLoading = false,
  bleed = false,
  decorationCampaign,
}: {
  user: MeResponse;
  summary: PublicProfileSummary | undefined;
  /// Кошелёк из `/wallet` (тот же для popover и sheet).
  wallet: WalletSummaryDto | undefined;
  walletLoading?: boolean;
  /// Устарело: шапка сразу из `/auth/me`, ожидание summary не блокирует.
  loading?: boolean;
  bleed?: boolean;
  /// Явная кампания украшения шапки (design-lab); по умолчанию — сайта.
  decorationCampaign?: SeasonalCampaign | null;
}) {
  const full = summary && !summary.hidden ? summary : null;
  const identity = full ? identityFromSummary(full) : identityFromMe(user);
  return (
    <div className="flex flex-col gap-3" data-testid="mini-profile">
      <ProfileHeader
        identity={identity}
        bleed={bleed}
        compact
        decorationCampaign={decorationCampaign}
      />
      <div className={bleed ? 'px-4' : 'px-3'}>
        {walletLoading ? (
          <Skeleton className="h-11 w-full" />
        ) : (
          <dl
            className="grid grid-cols-2 gap-3 rounded-lg bg-surface-sunken px-3 py-2"
            aria-label="Кошелёк"
          >
            <CompactStat
              label="Баланс"
              value={walletAmount(wallet, 'RUB')}
              icon={<CurrencyIcon currency="RUB" />}
              testId="wallet-rub"
            />
            <CompactStat
              label="Рубины"
              value={walletAmount(wallet, 'RUBY')}
              icon={<CurrencyIcon currency="RUBY" />}
              testId="wallet-ruby"
            />
          </dl>
        )}
      </div>
    </div>
  );
}
