'use client';

import type { MediaBadgeKind, UserBadgeKind } from '@twomc/shared';
import { BadgeCheck, Code2, Crown, Gem, Sparkles, Users, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { BrandIcon } from '@/components/shell/brand-icon';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';

/// Бейджи, медиа-бейджи и декорация профиля (ADR-0088) — один ряд иконок с
/// подсказками. Только реальные данные из API; пусто — ничего не рисуется.

export const USER_BADGE_META: Record<
  UserBadgeKind,
  { label: string; icon: LucideIcon; className: string }
> = {
  LEADERSHIP: { label: 'Руководство проекта', icon: Crown, className: 'text-warning' },
  VERIFIED: { label: 'Подтверждённый игрок', icon: BadgeCheck, className: 'text-info' },
  SUBSCRIBER_PLUS: { label: 'Подписчик+', icon: Gem, className: 'text-primary' },
  PROJECT_TEAM: { label: 'Команда проекта', icon: Users, className: 'text-success' },
  DEVELOPERS_TEAM: { label: 'Команда разработки', icon: Code2, className: 'text-info' },
};

const MEDIA_META: Record<MediaBadgeKind, { label: string; icon: 'youtube' | 'twitch' | 'tiktok' }> =
  {
    YOUTUBE: { label: 'Создатель контента · YouTube', icon: 'youtube' },
    TWITCH: { label: 'Создатель контента · Twitch', icon: 'twitch' },
    TIKTOK: { label: 'Создатель контента · TikTok', icon: 'tiktok' },
  };

export interface ProfileDecorationView {
  slug: string;
  name: string;
  imageUrl: string | null;
}

/// Картинка декорации; нет файла или не загрузился — нейтральная иконка, а
/// не битое изображение (название остаётся в подсказке).
function DecorationIcon({ decoration }: { decoration: ProfileDecorationView }) {
  const [broken, setBroken] = useState(false);
  if (!decoration.imageUrl || broken) {
    return <Sparkles aria-hidden className="size-4 text-primary" />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- CDN/хранилище twomc.su
    <img
      src={decoration.imageUrl}
      alt=""
      aria-hidden
      width={16}
      height={16}
      loading="lazy"
      decoding="async"
      onError={() => setBroken(true)}
      className="size-4 object-contain"
    />
  );
}

export function ProfileBadges({
  badges = [],
  mediaBadges = [],
  decoration = null,
  className,
}: {
  badges?: UserBadgeKind[];
  mediaBadges?: MediaBadgeKind[];
  decoration?: ProfileDecorationView | null;
  className?: string;
}) {
  if (badges.length === 0 && mediaBadges.length === 0 && !decoration) return null;
  return (
    <ul
      className={cn('flex min-w-0 flex-wrap items-center gap-1', className)}
      aria-label="Бейджи и украшения"
      data-testid="profile-badges"
    >
      {badges.map((kind) => {
        const meta = USER_BADGE_META[kind];
        const Icon = meta.icon;
        return (
          <li key={kind}>
            <Tooltip content={meta.label}>
              <span
                tabIndex={0}
                aria-label={meta.label}
                className="flex size-6 items-center justify-center rounded-md bg-surface-sunken outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <Icon aria-hidden className={cn('size-3.5', meta.className)} />
              </span>
            </Tooltip>
          </li>
        );
      })}
      {mediaBadges.map((kind) => (
        <li key={kind}>
          <Tooltip content={MEDIA_META[kind].label}>
            <span
              tabIndex={0}
              aria-label={MEDIA_META[kind].label}
              className="flex size-6 items-center justify-center rounded-md bg-surface-sunken text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <BrandIcon id={MEDIA_META[kind].icon} className="size-3.5" />
            </span>
          </Tooltip>
        </li>
      ))}
      {decoration ? (
        <li>
          <Tooltip content={`Украшение: ${decoration.name}`}>
            <span
              tabIndex={0}
              aria-label={`Украшение: ${decoration.name}`}
              data-decoration={decoration.slug}
              className="flex size-6 items-center justify-center rounded-md bg-surface-sunken outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <DecorationIcon decoration={decoration} />
            </span>
          </Tooltip>
        </li>
      ) : null}
    </ul>
  );
}
