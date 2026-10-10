'use client';

import type { ProfileSocialLinkDto, SocialPlatform } from '@twomc/shared';
import { Globe, Link2, Pencil } from 'lucide-react';
import Link from 'next/link';
import { siGithub, siSteam, siTiktok, siTwitch, siVk, siYoutube } from 'simple-icons';
import { BrandIcon } from '@/components/shell/brand-icon';
import { IconButton } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';

/// Блоки публичного профиля (B5, ADR-0091) — общие для страницы `/u/…` и
/// design-lab: кнопка «Редактировать профиль», привязанные аккаунты (только
/// реальные привязки Discord/Telegram) и соцсети пользователя.

export type ConnectedAccount = { provider: 'discord' | 'telegram'; name: string | null };

const SOCIAL_LABELS: Record<SocialPlatform, string> = {
  DISCORD: 'Discord',
  TELEGRAM: 'Telegram',
  VK: 'ВКонтакте',
  YOUTUBE: 'YouTube',
  TWITCH: 'Twitch',
  TIKTOK: 'TikTok',
  STEAM: 'Steam',
  GITHUB: 'GitHub',
  WEBSITE: 'Сайт',
};

/// Официальные знаки соцсетей (Simple Icons); сайт — нейтральная иконка.
const SOCIAL_ICONS: Partial<Record<SocialPlatform, { path: string }>> = {
  VK: siVk,
  YOUTUBE: siYoutube,
  TWITCH: siTwitch,
  TIKTOK: siTiktok,
  STEAM: siSteam,
  GITHUB: siGithub,
};

function SocialIcon({ platform }: { platform: SocialPlatform }) {
  const icon = SOCIAL_ICONS[platform];
  if (!icon) return <Globe aria-hidden className="size-4 shrink-0 text-muted-foreground" />;
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="size-4 shrink-0 fill-current text-muted-foreground"
    >
      <path d={icon.path} />
    </svg>
  );
}

/// Внешняя ссылка соцсети — только `https://…`; иначе показываем текстом.
function socialHref(value: string): string | null {
  return /^https:\/\//.test(value) ? value : null;
}

/// Круглая кнопка «Редактировать профиль» в правом верхнем углу баннера.
export function ProfileEditButton({ className }: { className?: string }) {
  return (
    <Tooltip content="Редактировать профиль">
      <IconButton
        asChild
        size="sm"
        variant="secondary"
        aria-label="Редактировать профиль"
        className={cn('group/edit rounded-full shadow-sm', className)}
      >
        <Link href="/settings">
          <Pencil className="transition-transform duration-fast group-hover/edit:-rotate-12 group-focus-visible/edit:-rotate-12 motion-reduce:transition-none motion-reduce:group-hover/edit:rotate-0" />
        </Link>
      </IconButton>
    </Tooltip>
  );
}

function ProfileSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section
      className="flex min-w-0 flex-col gap-3 rounded-xl bg-surface p-5 shadow-sm"
      aria-label={label}
    >
      <h2 className="text-sm font-semibold">{label}</h2>
      {children}
    </section>
  );
}

export function ConnectedAccountsSection({ accounts }: { accounts: ConnectedAccount[] }) {
  if (accounts.length === 0) return null;
  return (
    <ProfileSection label="Привязанные аккаунты">
      <ul className="grid gap-2 sm:grid-cols-2">
        {accounts.map((account) => (
          <li key={account.provider} className="flex min-w-0 items-center gap-2 text-sm">
            <BrandIcon id={account.provider} className="text-muted-foreground" />
            <span className="text-subtle-foreground">
              {account.provider === 'discord' ? 'Discord' : 'Telegram'}:
            </span>
            <span className="truncate">{account.name ?? 'привязан'}</span>
          </li>
        ))}
      </ul>
    </ProfileSection>
  );
}

export function SocialLinksSection({ links }: { links: ProfileSocialLinkDto[] }) {
  const socials = links.filter((link) => link.value);
  if (socials.length === 0) return null;
  return (
    <ProfileSection label="Соцсети">
      <ul className="grid gap-2 sm:grid-cols-2">
        {socials.map((link) => {
          const href = socialHref(link.value);
          return (
            <li key={link.platform} className="flex min-w-0 items-center gap-2 text-sm">
              <SocialIcon platform={link.platform} />
              <span className="shrink-0 text-subtle-foreground">
                {SOCIAL_LABELS[link.platform]}:
              </span>
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex min-w-0 items-center gap-1 text-primary hover:underline"
                >
                  <span className="truncate">{link.value}</span>
                  <Link2 aria-hidden className="size-3.5 shrink-0" />
                </a>
              ) : (
                <span className="truncate">{link.value}</span>
              )}
            </li>
          );
        })}
      </ul>
    </ProfileSection>
  );
}
