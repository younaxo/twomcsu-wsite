'use client';

import type { MediaBadgeKind, UserBadgeKind } from '@twomc/shared';
import { useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { UserIdentity } from '@/components/ui/user-identity';
import { cn } from '@/lib/cn';
import type { DisplayableRole } from '@/lib/roles/primary-role';
import { formatRelative } from '@/lib/format';
import { ProfileBadges, type ProfileDecorationView } from './profile-badges';

/// Шапка профиля (ADR-0088) — общий источник вида identity: превью по нику,
/// mini-profile в header, design-lab. Banner сверху, аватар частично
/// накладывается, ниже — ник с префиксом роли, ID, бейджи и присутствие.
/// Solid, без стекла; картинки — только реальные URL из API.

export interface ProfileIdentityView {
  username: string;
  shortId?: number | null;
  tag?: string | null;
  avatar: string | null;
  banner: string | null;
  role?: DisplayableRole | null;
  badges?: UserBadgeKind[];
  mediaBadges?: MediaBadgeKind[];
  decoration?: ProfileDecorationView | null;
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
  ringClassName = 'ring-surface-overlay',
  className,
}: {
  identity: ProfileIdentityView;
  /// Баннер во всю ширину контейнера без скругления (внутри popover).
  bleed?: boolean;
  /// Цвет «выреза» вокруг аватара — под поверхность контейнера.
  ringClassName?: string;
  className?: string;
}) {
  const { presence } = identity;
  return (
    <div className={cn('flex min-w-0 flex-col', className)} data-testid="profile-header">
      <ProfileBanner src={identity.banner} className={cn('h-20', bleed ? '' : 'rounded-lg')} />
      <div className={cn('-mt-7 flex items-end gap-3', bleed ? 'px-4' : 'px-3')}>
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
      </div>
      <div className={cn('flex min-w-0 flex-col gap-1.5 pt-2', bleed ? 'px-4' : 'px-3')}>
        <UserIdentity
          username={identity.username}
          role={identity.role ?? undefined}
          tag={identity.tag ?? undefined}
          prefixSize="sm"
        />
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {identity.shortId ? (
            <span className="text-xs tabular-nums text-subtle-foreground">
              ID {identity.shortId}
            </span>
          ) : null}
          <ProfileBadges
            badges={identity.badges}
            mediaBadges={identity.mediaBadges}
            decoration={identity.decoration}
          />
        </div>
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
