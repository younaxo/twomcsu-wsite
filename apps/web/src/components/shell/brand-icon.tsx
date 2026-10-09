import { siDiscord, siTelegram, siTiktok, siVk, siYoutube } from 'simple-icons';
import type { SocialLink } from '@/lib/site/config';
import { cn } from '@/lib/cn';

const ICONS: Record<SocialLink['id'], { path: string; title: string }> = {
  telegram: siTelegram,
  discord: siDiscord,
  tiktok: siTiktok,
  vk: siVk,
  youtube: siYoutube,
};

/// Официальные brand-иконки соцсетей (Simple Icons). Монохром в currentColor —
/// подстраивается под тему; цвет бренда не используем, чтобы не спорить с
/// оранжевым. Декоративны: подпись несёт родительская ссылка (aria-label).
export function BrandIcon({ id, className }: { id: SocialLink['id']; className?: string }) {
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
