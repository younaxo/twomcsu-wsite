'use client';

import { CalendarDays, MapPin, UserX } from 'lucide-react';
import { useParams } from 'next/navigation';
import { ProfilePreviewCard } from '@/components/profile/profile-preview';
import { ProfileHero } from '@/components/profile/profile-hero';
import { ConnectedAccountsSection, SocialLinksSection } from '@/components/profile/profile-links';
import { SkinViewer } from '@/components/profile/skin-viewer';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { SkeletonRows } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api/errors';
import { useAuthStore } from '@/lib/auth/store';
import { formatDate } from '@/lib/format';
import { useProfileSummary, usePublicProfile } from '@/lib/profile/hooks';

const GENDER_LABELS: Record<string, string> = {
  MALE: 'Мужской',
  FEMALE: 'Женский',
  OTHER: 'Другой',
};

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
  return (
    <div
      className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-3 py-6 md:px-6"
      data-testid="public-profile"
    >
      <ProfileHero
        handle={username}
        username={data.username}
        avatar={data.avatar ?? null}
        banner={data.banner ?? null}
        statusText={data.statusText}
        stats={data.stats}
        own={own}
        signedIn={!!me}
      />

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
          <ConnectedAccountsSection accounts={data.connectedAccounts ?? []} />
          <SocialLinksSection links={data.socialLinks ?? []} />
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
