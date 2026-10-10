'use client';

import type { MeResponse, PublicProfileSummary } from '@twomc/shared';
import {
  Heart,
  LayoutDashboard,
  MessageSquare,
  Package,
  Settings,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { identityFromSummary, playTime } from '@/components/profile/profile-preview';
import { ProfileHeader, type ProfileIdentityView } from '@/components/profile/profile-header';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import { pickPrimaryRole } from '@/lib/roles/primary-role';

/// Mini profile (ADR-0088): шапка с баннером, аватаром, ником, ID, префиксом
/// роли, бейджами и присутствием → компактная статистика → меню. Один
/// источник данных для popover (desktop) и bottom sheet (mobile): `/auth/me`
/// даёт шапку сразу, summary профиля — бейджи, статистику и присутствие.

export interface MiniProfileEntry {
  key: string;
  label: string;
  icon: LucideIcon;
  /// Нет href — раздел ещё не готов: пункт недоступен с пометкой «скоро».
  href: string | null;
}

export function miniProfileEntries(username: string, admin: boolean): MiniProfileEntry[] {
  const entries: MiniProfileEntry[] = [
    {
      key: 'profile',
      label: 'Мой профиль',
      icon: UserRound,
      href: `/u/${encodeURIComponent(username)}`,
    },
    { key: 'settings', label: 'Настройки', icon: Settings, href: '/settings' },
    // Разделы волн Social (2) и Store (4) — появятся вместе с функцией.
    { key: 'messages', label: 'Сообщения', icon: MessageSquare, href: null },
    { key: 'friends', label: 'Друзья', icon: Users, href: null },
    { key: 'favorites', label: 'Избранное', icon: Heart, href: null },
    { key: 'orders', label: 'Заказы', icon: Package, href: null },
  ];
  if (admin) {
    entries.push({ key: 'admin', label: 'Админ-панель', icon: LayoutDashboard, href: '/admin' });
  }
  return entries;
}

/// Шапка из `/auth/me` — пока summary не пришёл (или недоступен).
export function identityFromMe(user: MeResponse): ProfileIdentityView {
  return {
    username: user.username,
    shortId: user.shortId,
    tag: user.tag,
    avatar: user.avatar,
    banner: user.banner,
    role: pickPrimaryRole(user.roles),
    presence: null,
  };
}

function CompactStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="truncate text-[11px] text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

export function MiniProfileSummary({
  user,
  summary,
  loading,
  bleed = false,
}: {
  user: MeResponse;
  summary: PublicProfileSummary | undefined;
  loading: boolean;
  bleed?: boolean;
}) {
  const full = summary && !summary.hidden ? summary : null;
  const identity = full ? identityFromSummary(full) : identityFromMe(user);
  return (
    <div className="flex flex-col gap-3" data-testid="mini-profile">
      <ProfileHeader identity={identity} bleed={bleed} />
      <div className={bleed ? 'px-4' : 'px-3'}>
        {loading ? (
          <Skeleton className="h-9 w-full" />
        ) : full ? (
          <dl
            className={cn(
              'grid gap-3 rounded-lg bg-surface-sunken px-3 py-2',
              full.statistics ? 'grid-cols-3' : 'grid-cols-2',
            )}
            aria-label="Статистика"
          >
            <CompactStat label="Друзья" value={formatNumber(full.friendsCount)} />
            <CompactStat label="Достижения" value={formatNumber(full.achievementsCompleted)} />
            {full.statistics ? (
              <CompactStat label="В игре" value={playTime(full.statistics.playTimeMinutes)} />
            ) : null}
          </dl>
        ) : null}
      </div>
    </div>
  );
}
