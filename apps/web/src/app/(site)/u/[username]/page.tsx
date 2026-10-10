'use client';

import type { SocialPlatform } from '@twomc/shared';
import { CalendarDays, MapPin, UserX } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ProfilePreviewCard } from '@/components/profile/profile-preview';
import { ProfileBanner } from '@/components/profile/profile-header';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
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
};

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
  const own = me?.username.toLowerCase() === username.toLowerCase();

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
        <ProfileBanner src={data.banner ?? null} className="h-28 md:h-40" />
        <div className="flex flex-wrap items-end gap-4 px-5 pb-5">
          <Avatar
            src={data.avatar ?? null}
            name={data.username}
            size="xl"
            className="-mt-10 ring-4 ring-surface"
          />
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-2xl font-bold">{data.username}</h1>
            {data.statusText ? (
              <p className="text-sm text-muted-foreground">{data.statusText}</p>
            ) : null}
          </div>
          {own ? (
            <Button asChild size="sm" variant="secondary">
              <Link href="/settings">Редактировать профиль</Link>
            </Button>
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
                    <li key={link.platform} className="min-w-0 text-sm">
                      <span className="text-subtle-foreground">
                        {SOCIAL_LABELS[link.platform]}:{' '}
                      </span>
                      {href ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="break-all text-primary hover:underline"
                        >
                          {link.value}
                        </a>
                      ) : (
                        <span className="break-all">{link.value}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </div>
        <aside className="rounded-xl bg-surface shadow-sm lg:self-start">
          <ProfilePreviewCard
            username={data.username}
            summary={summary.data}
            loading={summary.isPending}
            error={summary.isError}
          />
        </aside>
      </div>
    </div>
  );
}
