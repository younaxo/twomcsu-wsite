'use client';

import type { MediaBadgeKind, UserBadgeKind } from '@twomc/shared';
import type { ReactNode } from 'react';
import { MinecraftHead } from '@/components/profile/minecraft-head';
import { ProfileBadges, type ProfileDecorationView } from '@/components/profile/profile-badges';
import { ProfileBanner } from '@/components/profile/profile-header';
import { ProfileEditButton } from '@/components/profile/profile-links';
import { ProfileMetrics } from '@/components/profile/profile-metrics';
import { Avatar } from '@/components/ui/avatar';
import { RolePrefix } from '@/components/ui/role-prefix';
import type { ProfileStatsDto } from '@/lib/profile/hooks';
import type { DisplayableRole } from '@/lib/roles/primary-role';

/// Шапка публичного профиля `/u/…` (B5, D5). На баннере: слева сверху —
/// круглая «Редактировать» (только свой профиль), справа сверху — метрики
/// (просмотры, оценки). Ниже — аватар с 3D-головой скина и identity: префикс
/// роли, ник, статус, бейджи. Правый нижний угол — место под будущие награды
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
  /// Уровень заголовка с ником: на странице профиля — h1, в design-lab — h3.
  titleAs?: 'h1' | 'h3';
}) {
  const hasBadges = !!(badges?.length || mediaBadges?.length || decoration);
  return (
    <section className="overflow-hidden rounded-xl bg-surface shadow-sm" data-testid="profile-hero">
      <div className="relative">
        <ProfileBanner src={banner} className="h-28 md:h-40" />
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
          {role ? <RolePrefix role={role} size="xs" className="self-start" /> : null}
          <Title className="truncate font-display text-2xl font-bold">{username}</Title>
          {statusText ? (
            <p
              className="truncate text-sm text-muted-foreground"
              title={statusText}
              data-testid="profile-status"
            >
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
