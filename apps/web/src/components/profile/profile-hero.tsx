'use client';

import type { MediaBadgeKind, UserBadgeKind } from '@twomc/shared';
import type { ReactNode } from 'react';
import { MinecraftHead } from '@/components/profile/minecraft-head';
import { ProfileBadges, type ProfileDecorationView } from '@/components/profile/profile-badges';
import { ProfileBanner } from '@/components/profile/profile-header';
import { ProfileEditButton } from '@/components/profile/profile-links';
import { ProfileMetrics } from '@/components/profile/profile-metrics';
import { SeasonalHeaderDecoration } from '@/components/shell/seasonal-header-decoration';
import { Avatar } from '@/components/ui/avatar';
import { RolePrefix } from '@/components/ui/role-prefix';
import type { ProfileStatsDto } from '@/lib/profile/hooks';
import type { SeasonalCampaign } from '@/lib/site/seasonal';
import { identityPrefix, type DisplayableRole } from '@/lib/roles/primary-role';

/// Шапка публичного профиля `/u/…` (B5, D5). Над баннером — то же сезонное
/// украшение, что в шапке сайта (один компонент, флаг «Украшение шапки»). На
/// баннере: слева сверху — круглая «Редактировать» (только свой профиль),
/// справа сверху — метрики (просмотры, оценки). Ниже — аватар с 3D-головой
/// скина и identity: `[PREFIX] ник` одной строкой, под ней статус и бейджи. Правый нижний угол — место под будущие награды
/// (`ProfileAwardsSlot`): пока наград нет, там ничего не рисуется. Та же
/// шапка — в design-lab.

/// Будущая плашка «Награды». Наград нет — слот пустой (никаких заглушек).
export function ProfileAwardsSlot({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <div className="ml-auto self-end" data-testid="profile-awards">
      {children}
    </div>
  );
}

export function ProfileHero({
  handle,
  username,
  avatar,
  banner,
  statusText,
  stats,
  own,
  signedIn,
  role,
  badges,
  mediaBadges,
  decoration,
  awards,
  decorationCampaign,
  titleAs: Title = 'h1',
}: {
  /// Адрес профиля как в URL (ник сайта, алиас или Minecraft-ник).
  handle: string;
  username: string;
  avatar: string | null;
  banner: string | null;
  statusText?: string | null;
  stats?: ProfileStatsDto | null;
  own: boolean;
  signedIn: boolean;
  role?: DisplayableRole | null;
  badges?: UserBadgeKind[];
  mediaBadges?: MediaBadgeKind[];
  decoration?: ProfileDecorationView | null;
  /// Плашка наград — появится вместе с системой наград.
  awards?: ReactNode;
  /// Явная кампания украшения шапки (design-lab); по умолчанию — сайта.
  decorationCampaign?: SeasonalCampaign | null;
  /// Уровень заголовка с ником: на странице профиля — h1, в design-lab — h3.
  titleAs?: 'h1' | 'h3';
}) {
  const hasBadges = !!(badges?.length || mediaBadges?.length || decoration);
  const prefix = identityPrefix(role, mediaBadges);
  return (
    <section className="overflow-hidden rounded-xl bg-surface shadow-sm" data-testid="profile-hero">
      <div className="relative">
        <ProfileBanner src={banner} className="h-28 md:h-40" />
        <SeasonalHeaderDecoration campaign={decorationCampaign} />
        {own ? <ProfileEditButton className="absolute left-3 top-3" /> : null}
        {stats ? (
          <ProfileMetrics
            handle={handle}
            stats={stats}
            own={own}
            signedIn={signedIn}
            className="absolute right-3 top-3"
          />
        ) : null}
      </div>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3 px-5 pb-5">
        <div className="flex shrink-0 items-end gap-3">
          <Avatar src={avatar} name={username} size="xl" className="-mt-10 ring-4 ring-surface" />
          <MinecraftHead username={username} size={36} className="mb-1" />
        </div>
        <div
          className="flex min-w-0 flex-1 basis-56 flex-col gap-1 pt-3"
          data-testid="profile-identity"
        >
          {/* [PREFIX] ник — одна строка, без переноса: префикс ужимается до
              ~45% ширины, ник обрезается многоточием (ADR-0099). */}
          <div
            className="flex min-w-0 flex-nowrap items-center gap-2"
            data-testid="profile-identity-line"
          >
            {role || prefix ? (
              <span className="flex min-w-0 max-w-[45%] shrink-0">
                <RolePrefix role={role} prefix={prefix} size="xs" loading="eager" />
              </span>
            ) : null}
            <Title className="min-w-0 truncate font-display text-2xl font-bold">{username}</Title>
          </div>
          {statusText ? (
            <p className="line-clamp-2 text-sm text-muted-foreground" data-testid="profile-status">
              {statusText}
            </p>
          ) : null}
          {hasBadges ? (
            <ProfileBadges badges={badges} mediaBadges={mediaBadges} decoration={decoration} />
          ) : null}
        </div>
        <ProfileAwardsSlot>{awards}</ProfileAwardsSlot>
      </div>
    </section>
  );
}
