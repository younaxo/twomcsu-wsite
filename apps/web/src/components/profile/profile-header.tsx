'use client';

import type { MediaBadgeKind, UserBadgeKind } from '@twomc/shared';
import { useState } from 'react';
import { MinecraftHead } from '@/components/profile/minecraft-head';
import { SeasonalHeaderDecoration } from '@/components/shell/seasonal-header-decoration';
import { Avatar } from '@/components/ui/avatar';
import { UserIdentity } from '@/components/ui/user-identity';
import { cn } from '@/lib/cn';
import type { SeasonalCampaign } from '@/lib/site/seasonal';
import type { DisplayableRole } from '@/lib/roles/primary-role';
import { formatRelative } from '@/lib/format';
import { ProfileBadges, type ProfileDecorationView } from './profile-badges';

/// Шапка профиля (ADR-0088, ADR-0099) — общий источник вида identity: превью
/// по нику, mini-profile в header, design-lab. Banner сверху, аватар частично
/// накладывается, ниже — ОДНА строка `[PREFIX] ник#0000` и присутствие.
/// - `compact` (mini profile): над баннером — то же сезонное украшение, что в
///   шапке сайта (`SeasonalHeaderDecoration`, один источник), рядом с аватаром —
///   3D-голова; без статуса, бейджей и внутренних номеров — только identity,
///   присутствие (дальше — кошелёк и меню).
/// - Превью по нику: identity, статус, бейджи, присутствие.
/// Solid, без стекла; картинки — только реальные URL из API.

export interface ProfileIdentityView {
  username: string;
  /// Публичный discriminator — четыре цифры (ADR-0099).
  discriminator?: string | null;
  tag?: string | null;
  avatar: string | null;
  banner: string | null;
  role?: DisplayableRole | null;
  badges?: UserBadgeKind[];
  mediaBadges?: MediaBadgeKind[];
  decoration?: ProfileDecorationView | null;
  /// Свой статус под ником (из профиля, не отдельный источник).
  status?: string | null;
  /// Присутствие — только если данные есть (не выдумываем «онлайн»).
  presence?: {
    online: boolean;
    currentServer: string | null;
    lastActivityAt: string | null;
  } | null;
  system?: boolean;
}

/// Баннер пользователя. Нет баннера или файл не загрузился — нейтральная
/// поверхность (не случайный градиент и не битая картинка).
export function ProfileBanner({ src, className }: { src: string | null; className?: string }) {
  const [broken, setBroken] = useState(false);
  const show = !!src && !broken;
  return (
    <div
      className={cn('relative w-full overflow-hidden bg-surface-sunken', className)}
      data-testid="profile-banner"
      data-state={show ? 'image' : 'empty'}
    >
      {show ? (
        // eslint-disable-next-line @next/next/no-img-element -- CDN/хранилище twomc.su
        <img
          src={src}
          alt=""
          aria-hidden
          decoding="async"
          onError={() => setBroken(true)}
          className="size-full object-cover"
        />
      ) : null}
    </div>
  );
}

export function presenceLabel(presence: NonNullable<ProfileIdentityView['presence']>): string {
  if (presence.online) {
    return presence.currentServer ? `В игре · ${presence.currentServer}` : 'В игре';
  }
  return presence.lastActivityAt
    ? `Был(а) ${formatRelative(presence.lastActivityAt)}`
    : 'Не в игре';
}

export function ProfileHeader({
  identity,
  bleed = false,
  compact = false,
  decorationCampaign,
  ringClassName = 'ring-surface-overlay',
  className,
}: {
  identity: ProfileIdentityView;
  /// Баннер во всю ширину контейнера без скругления (внутри popover).
  bleed?: boolean;
  /// Mini profile: украшение, 3D-голова, только identity и присутствие.
  compact?: boolean;
  /// Явная кампания украшения (design-lab); по умолчанию — активная на сайте.
  decorationCampaign?: SeasonalCampaign | null;
  /// Цвет «выреза» вокруг аватара — под поверхность контейнера.
  ringClassName?: string;
  className?: string;
}) {
  const { presence } = identity;
  return (
    <div
      className={cn('flex min-w-0 flex-col', className)}
      data-testid="profile-header"
      data-compact={compact || undefined}
    >
      <div className="relative">
        <ProfileBanner src={identity.banner} className={cn('h-20', bleed ? '' : 'rounded-lg')} />
        {compact ? (
          <SeasonalHeaderDecoration
            campaign={decorationCampaign}
            className={bleed ? 'rounded-none' : 'rounded-t-lg'}
          />
        ) : null}
      </div>
      <div className={cn('-mt-7 flex items-end gap-2', bleed ? 'px-4' : 'px-3')}>
        <span className="relative shrink-0">
          <Avatar
            src={identity.avatar ?? undefined}
            name={identity.username}
            size="lg"
            className={cn('ring-4', ringClassName)}
          />
          {presence?.online ? (
            <span
              aria-hidden
              className={cn(
                'absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full bg-success ring-2',
                ringClassName,
              )}
            />
          ) : null}
        </span>
        {compact && !identity.system ? (
          <MinecraftHead username={identity.username} size={26} className="mb-0.5" />
        ) : null}
      </div>
      <div className={cn('flex min-w-0 flex-col gap-1.5 pt-2', bleed ? 'px-4' : 'px-3')}>
        <UserIdentity
          username={identity.username}
          role={identity.role ?? undefined}
          mediaBadges={identity.mediaBadges}
          discriminator={identity.discriminator}
          tag={identity.tag ?? undefined}
          prefixSize={compact ? 'compact' : 'xs'}
        />
        {!compact && identity.status ? (
          <p className="line-clamp-2 text-xs text-muted-foreground" data-testid="profile-status">
            {identity.status}
          </p>
        ) : null}
        {!compact ? (
          <ProfileBadges
            badges={identity.badges}
            mediaBadges={identity.mediaBadges}
            decoration={identity.decoration}
          />
        ) : null}
        {presence && !identity.system ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              aria-hidden
              className={cn(
                'size-2 shrink-0 rounded-full',
                presence.online ? 'bg-success' : 'bg-border-strong',
              )}
            />
            <span className="truncate">{presenceLabel(presence)}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
