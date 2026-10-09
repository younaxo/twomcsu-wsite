import type { SiteSocialPlatform } from '@twomc/shared';
import {
  siDiscord,
  siFacebook,
  siInstagram,
  siTelegram,
  siTiktok,
  siTwitch,
  siVk,
  siX,
  siYoutube,
} from 'simple-icons';
import { cn } from '@/lib/cn';

const ICONS: Record<SiteSocialPlatform, { path: string; title: string }> = {
  telegram: siTelegram,
  discord: siDiscord,
  tiktok: siTiktok,
  vk: siVk,
  youtube: siYoutube,
  twitch: siTwitch,
  instagram: siInstagram,
  x: siX,
  facebook: siFacebook,
};

/// Официальные brand-иконки соцсетей (Simple Icons). Монохром в currentColor —
/// подстраивается под тему; цвет бренда не используем, чтобы не спорить с
/// оранжевым. Декоративны: подпись несёт родительская ссылка (aria-label).
export function BrandIcon({ id, className }: { id: SiteSocialPlatform; className?: string }) {
  const icon = ICONS[id];
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox="0 0 24 24"
      className={cn('size-4 shrink-0 fill-current', className)}
    >
      <path d={icon.path} />
    </svg>
  );
}
