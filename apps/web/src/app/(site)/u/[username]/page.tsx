'use client';

import { EyeOff, UserX } from 'lucide-react';
import { useParams } from 'next/navigation';
import { FriendButton } from '@/components/friends/friend-button';
import { WriteButton } from '@/components/messages/write-button';
import { ProfileInfoSection } from '@/components/profile/profile-info';
import { ProfilePreviewCard } from '@/components/profile/profile-preview';
import { ProfileComments } from '@/components/profile/profile-comments';
import { ProfileHero } from '@/components/profile/profile-hero';
import { ConnectedAccountsSection, SocialLinksSection } from '@/components/profile/profile-links';
import { ProfileShowcase } from '@/components/profile/profile-showcase';
import { SkinViewer } from '@/components/profile/skin-viewer';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { SafeMarkdown } from '@/components/ui/safe-markdown';
import { SkeletonRows } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api/errors';
import { useAuthStore } from '@/lib/auth/store';
import { useProfileShowcase, useProfileSummary, usePublicProfile } from '@/lib/profile/hooks';
import { pickPrimaryRole } from '@/lib/roles/primary-role';
import { usePublicSiteSettings } from '@/lib/site/hooks';

/// Публичный профиль игрока (ADR-0100): данные уже отфильтрованы сервером по
/// приватности. Скрытый (приватность, блокировка) и несуществующий профиль —
/// разные понятные состояния (ADR-0106).
/// «О себе» — только bio (безопасный Markdown), «Информация» — метаданные,
/// «Игрок» — витрина наград и значков и игровая статистика.
export default function PublicProfilePage() {
  const params = useParams<{ username: string }>();
  const username = decodeURIComponent(params.username);
  const me = useAuthStore((state) => state.user);
  const profile = usePublicProfile(username);
  const summary = useProfileSummary(username, true);
  const showcase = useProfileShowcase(username);
  const site = usePublicSiteSettings();
  const visible = profile.data && !profile.data.hidden ? profile.data : null;
  // Владелец — по id (адрес может быть alias или Minecraft-ником).
  const own = !!me && !!visible && me.id === visible.id;
  const reportable = !!me && !own && site.data?.modules?.reports === true;
  const befriendable = !!me && !own && site.data?.modules?.friends === true;

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
            title="Профиль не найден"
            description={`Игрока с ником «${username}» нет на twomc.su. Проверьте адрес.`}
          />
        ) : (
          <ErrorState error={profile.error} onRetry={() => profile.refetch()} />
        )}
      </div>
    );
  }

  if (profile.data.hidden) {
    return (
      <div className="mx-auto max-w-xl px-3 py-10 md:px-6" data-testid="profile-hidden">
        <EmptyState
          icon={<EyeOff />}
          title={`Профиль ${profile.data.username} скрыт`}
          description="Игрок ограничил доступ к профилю настройками приватности."
        />
      </div>
    );
  }

  const data = profile.data;
  // Префикс роли и бейджи — из summary (тот же источник, что у mini profile).
  const identity = summary.data && !summary.data.hidden ? summary.data : null;
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
        reportable={reportable}
        actions={
          me && !own ? (
            <div className="flex flex-wrap items-center gap-2">
              <WriteButton username={data.username} />
              {befriendable ? <FriendButton username={data.username} /> : null}
            </div>
          ) : undefined
        }
        role={identity ? pickPrimaryRole(identity.roles) : null}
        badges={identity?.badges}
        mediaBadges={identity?.mediaBadges}
        decoration={identity?.decoration}
        showBadges={false}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-5">
          <section
            className="flex flex-col gap-3 rounded-xl bg-surface p-5 shadow-sm"
            aria-label="О себе"
            data-testid="profile-about"
          >
            <h2 className="text-sm font-semibold">О себе</h2>
            {data.bio?.trim() ? (
              <SafeMarkdown source={data.bio} className="text-foreground/90" />
            ) : (
              <p className="text-sm text-muted-foreground">
                Игрок пока ничего о себе не рассказал.
              </p>
            )}
          </section>
          <ProfileInfoSection
            city={data.city}
            country={data.country}
            birthday={data.birthday}
            gender={data.gender}
            createdAt={data.createdAt}
          />
          <ConnectedAccountsSection accounts={data.connectedAccounts ?? []} />
          <SocialLinksSection links={data.socialLinks ?? []} />
          {site.data?.modules?.comments === false ? null : (
            <ProfileComments username={data.username} signedIn={!!me} />
          )}
        </div>
        <aside className="flex flex-col gap-5 lg:self-start">
          <div className="rounded-xl bg-surface p-5 shadow-sm">
            <SkinViewer username={data.username} />
          </div>
          <section
            className="flex flex-col gap-5 rounded-xl bg-surface p-5 shadow-sm"
            aria-label="Игрок"
            data-testid="profile-player"
          >
            <ProfileShowcase
              showcase={showcase.data}
              loading={showcase.isPending}
              badges={identity?.badges}
              mediaBadges={identity?.mediaBadges}
              decoration={identity?.decoration}
            />
            <div className="h-px bg-border-subtle" />
            <ProfilePreviewCard
              username={data.username}
              summary={summary.data}
              loading={summary.isPending}
              error={summary.isError}
              showHeader={false}
              showJoined={false}
              showOpenLink={false}
            />
          </section>
        </aside>
      </div>
    </div>
  );
}
