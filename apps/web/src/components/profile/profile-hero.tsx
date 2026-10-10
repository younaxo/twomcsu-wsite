'use client';

import { MinecraftHead } from '@/components/profile/minecraft-head';
import { ProfileEngagement } from '@/components/profile/profile-engagement';
import { ProfileBanner } from '@/components/profile/profile-header';
import { ProfileEditButton } from '@/components/profile/profile-links';
import { Avatar } from '@/components/ui/avatar';
import type { ProfileStatsDto } from '@/lib/profile/hooks';

/// Шапка публичного профиля `/u/…` (B5): баннер (или нейтральная
/// поверхность), круглая «Редактировать» справа сверху — только на своём,
/// аватар с 3D-головой скина, ник и статус, просмотры и оценки. Та же — в
/// design-lab.
export function ProfileHero({
  handle,
  username,
  avatar,
  banner,
  statusText,
  stats,
  own,
  signedIn,
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
  /// Уровень заголовка с ником: на странице профиля — h1, в design-lab — h3.
  titleAs?: 'h1' | 'h3';
}) {
  return (
    <section className="overflow-hidden rounded-xl bg-surface shadow-sm" data-testid="profile-hero">
      <div className="relative">
        <ProfileBanner src={banner} className="h-28 md:h-40" />
        {own ? <ProfileEditButton className="absolute right-3 top-3" /> : null}
      </div>
      <div className="flex flex-wrap items-end gap-4 px-5 pb-5">
        <Avatar src={avatar} name={username} size="xl" className="-mt-10 ring-4 ring-surface" />
        <MinecraftHead username={username} size={36} className="mb-1" />
        <div className="min-w-0 flex-1">
          <Title className="truncate font-display text-2xl font-bold">{username}</Title>
          {statusText ? <p className="text-sm text-muted-foreground">{statusText}</p> : null}
        </div>
        {stats ? (
          <ProfileEngagement handle={handle} stats={stats} own={own} signedIn={signedIn} />
        ) : null}
      </div>
    </section>
  );
}
