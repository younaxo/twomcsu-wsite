'use client';

import type { SocialPlatform } from '@twomc/shared';
import { CalendarDays, Globe, Link2, MapPin, Pencil, UserX } from 'lucide-react';
import { siGithub, siSteam, siTiktok, siTwitch, siVk, siYoutube } from 'simple-icons';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ProfilePreviewCard } from '@/components/profile/profile-preview';
import { ProfileBanner } from '@/components/profile/profile-header';
import { MinecraftHead } from '@/components/profile/minecraft-head';
import { ProfileEngagement } from '@/components/profile/profile-engagement';
import { SkinViewer } from '@/components/profile/skin-viewer';
import { BrandIcon } from '@/components/shell/brand-icon';
import { Avatar } from '@/components/ui/avatar';
import { IconButton } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { SkeletonRows } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api/errors';
import { useAuthStore } from '@/lib/auth/store';
import { formatDate } from '@/lib/format';
import { useProfileSummary, usePublicProfile } from '@/lib/profile/hooks';

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

const GENDER_LABELS: Record<string, string> = {
  MALE: 'Мужской',
  FEMALE: 'Женский',
  OTHER: 'Другой',
};

/// Внешняя ссылка соцсети — только `https://…`; иначе показываем текстом.
function socialHref(value: string): string | null {
  return /^https:\/\//.test(value) ? value : null;
}

/// Публичный профиль игрока (волна 1): данные уже отфильтрованы сервером по
/// приватности; скрытый или несуществующий профиль — понятное состояние.
export default function PublicProfilePage() {
  const params = useParams<{ username: string }>();
  const username = decodeURIComponent(params.username);
  const me = useAuthStore((state) => state.user);
  const profile = usePublicProfile(username);
  const summary = useProfileSummary(username, true);
  // Владелец — по id (адрес может быть alias или Minecraft-ником).
  const own = !!me && !!profile.data && me.id === profile.data.id;

  if (profile.isPending) {
    return (
      <div className="mx-auto max-w-5xl px-3 py-6 md:px-6">
        <SkeletonRows rows={6} />
      </div>
    );
  }
  if (profile.isError) {
    const missing = profile.error instanceof ApiError && profile.error.status === 404;
    return (
      <div className="mx-auto max-w-xl px-3 py-10 md:px-6">
        {missing ? (
          <EmptyState
            icon={<UserX />}
            title="Профиль не найден или скрыт"
            description="Игрок мог закрыть профиль настройками приватности."
          />
        ) : (
          <ErrorState error={profile.error} onRetry={() => profile.refetch()} />
        )}
      </div>
    );
  }

  const data = profile.data;
  const location = [data.city, data.country].filter(Boolean).join(', ');
  const socials = (data.socialLinks ?? []).filter((link) => link.value);
  return (
    <div
      className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-3 py-6 md:px-6"
      data-testid="public-profile"
    >
      <section className="overflow-hidden rounded-xl bg-surface shadow-sm">
        <div className="relative">
          <ProfileBanner src={data.banner ?? null} className="h-28 md:h-40" />
          {own ? (
            <Tooltip content="Редактировать профиль">
              <IconButton
                asChild
                size="sm"
                variant="secondary"
                aria-label="Редактировать профиль"
                className="group/edit absolute right-3 top-3 rounded-full shadow-sm"
              >
                <Link href="/settings">
                  <Pencil className="transition-transform duration-fast group-hover/edit:-rotate-12 group-focus-visible/edit:-rotate-12 motion-reduce:transition-none motion-reduce:group-hover/edit:rotate-0" />
                </Link>
              </IconButton>
            </Tooltip>
          ) : null}
        </div>
        <div className="flex flex-wrap items-end gap-4 px-5 pb-5">
          <Avatar
            src={data.avatar ?? null}
            name={data.username}
            size="xl"
            className="-mt-10 ring-4 ring-surface"
          />
          <MinecraftHead username={data.username} size={36} className="mb-1" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-2xl font-bold">{data.username}</h1>
            {data.statusText ? (
              <p className="text-sm text-muted-foreground">{data.statusText}</p>
            ) : null}
          </div>
          {data.stats ? (
            <ProfileEngagement handle={username} stats={data.stats} own={own} signedIn={!!me} />
          ) : null}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-5">
          <section
            className="flex flex-col gap-3 rounded-xl bg-surface p-5 shadow-sm"
            aria-label="О себе"
          >
            <h2 className="text-sm font-semibold">О себе</h2>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {data.bio || 'Игрок пока ничего о себе не рассказал.'}
            </p>
            <ul className="flex flex-col gap-1.5 text-sm">
              {location ? (
                <li className="flex items-center gap-2">
                  <MapPin aria-hidden className="size-4 text-subtle-foreground" />
                  {location}
                </li>
              ) : null}
              {data.birthDate && data.showBirthDate ? (
                <li className="flex items-center gap-2">
                  <CalendarDays aria-hidden className="size-4 text-subtle-foreground" />
                  День рождения: {formatDate(data.birthDate)}
                </li>
              ) : null}
              {data.gender && GENDER_LABELS[data.gender] ? (
                <li className="text-muted-foreground">Пол: {GENDER_LABELS[data.gender]}</li>
              ) : null}
              {data.createdAt ? (
                <li className="text-muted-foreground">
                  На twomc.su с {formatDate(data.createdAt)}
                </li>
              ) : null}
            </ul>
          </section>
          {(data.connectedAccounts?.length ?? 0) > 0 ? (
            <section
              className="flex flex-col gap-3 rounded-xl bg-surface p-5 shadow-sm"
              aria-label="Привязанные аккаунты"
            >
              <h2 className="text-sm font-semibold">Привязанные аккаунты</h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {data.connectedAccounts!.map((account) => (
                  <li key={account.provider} className="flex min-w-0 items-center gap-2 text-sm">
                    <BrandIcon id={account.provider} className="text-muted-foreground" />
                    <span className="text-subtle-foreground">
                      {account.provider === 'discord' ? 'Discord' : 'Telegram'}:
                    </span>
                    <span className="truncate">{account.name ?? 'привязан'}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {socials.length > 0 ? (
            <section
              className="flex flex-col gap-3 rounded-xl bg-surface p-5 shadow-sm"
              aria-label="Соцсети"
            >
              <h2 className="text-sm font-semibold">Соцсети</h2>
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
            </section>
          ) : null}
        </div>
        <aside className="flex flex-col gap-5 lg:self-start">
          <div className="rounded-xl bg-surface p-5 shadow-sm">
            <SkinViewer username={data.username} />
          </div>
          <div className="rounded-xl bg-surface p-5 shadow-sm">
            <ProfilePreviewCard
              username={data.username}
              summary={summary.data}
              loading={summary.isPending}
              error={summary.isError}
              showHeader={false}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
