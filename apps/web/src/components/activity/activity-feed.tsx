'use client';

import type { ActivityDto, ActivityReactionKey } from '@twomc/shared';
import { ACTIVITY_REACTIONS } from '@twomc/shared';
import {
  Flame,
  Heart,
  Laugh,
  MessageSquare,
  Sparkles,
  ThumbsUp,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { SkeletonRows } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { Tooltip } from '@/components/ui/tooltip';
import { UserIdentity } from '@/components/ui/user-identity';
import { getErrorMessage } from '@/lib/api/errors';
import { useActivityActions, useActivityFeed } from '@/lib/activity/hooks';
import { useAuthStore } from '@/lib/auth/store';
import { cn } from '@/lib/cn';
import { formatDateTime, formatNumber, formatRelative } from '@/lib/format';

/// Лента активности (срез 2.6, ADR-0114): карточки записей с реакциями
/// (иконки lucide, без emoji — ADR-0085) и числом комментариев; «Показать ещё».

export const ACTIVITY_REACTION_META: Record<
  ActivityReactionKey,
  { icon: LucideIcon; label: string }
> = {
  like: { icon: ThumbsUp, label: 'Нравится' },
  heart: { icon: Heart, label: 'Сердце' },
  laugh: { icon: Laugh, label: 'Смешно' },
  fire: { icon: Flame, label: 'Огонь' },
  wow: { icon: Sparkles, label: 'Впечатляет' },
};

/// Текст записи: дружба — с ником друга, иначе заголовок записи.
function ActivityText({ activity }: { activity: ActivityDto }) {
  if (activity.type === 'FRIENDSHIP_STARTED' && activity.friend) {
    return (
      <p className="text-sm">
        Теперь дружит с{' '}
        <Link
          href={`/u/${encodeURIComponent(activity.friend.username)}`}
          className="font-medium hover:underline"
        >
          {activity.friend.username}
        </Link>
      </p>
    );
  }
  return <p className="text-sm">{activity.title}</p>;
}

export function ActivityCard({
  activity,
  linkToDetails = true,
}: {
  activity: ActivityDto;
  linkToDetails?: boolean;
}) {
  const signedIn = useAuthStore((state) => state.status === 'authenticated');
  const { react } = useActivityActions();
  return (
    <article className="flex gap-3 px-4 py-3" data-testid="activity-card">
      <Avatar src={activity.user.avatar} name={activity.user.username} size="sm" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <UserIdentity username={activity.user.username} tag={activity.user.tag} previewable />
          <Tooltip content={formatDateTime(activity.createdAt)}>
            <time dateTime={activity.createdAt} className="shrink-0 text-xs text-subtle-foreground">
              {formatRelative(activity.createdAt)}
            </time>
          </Tooltip>
        </div>
        <div className="flex items-start gap-2">
          {activity.type === 'FRIENDSHIP_STARTED' ? (
            <UserPlus aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          ) : null}
          <ActivityText activity={activity} />
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {ACTIVITY_REACTIONS.map((key) => {
            const { icon: Icon, label } = ACTIVITY_REACTION_META[key];
            const count = activity.reactions.find((item) => item.key === key)?.count ?? 0;
            if (!signedIn && count === 0) return null;
            const active = activity.myReaction === key;
            return (
              <Tooltip key={key} content={signedIn ? label : 'Войдите, чтобы отреагировать'}>
                <button
                  type="button"
                  aria-label={`${label}${count ? `: ${count}` : ''}`}
                  aria-pressed={active}
                  aria-disabled={!signedIn || undefined}
                  onClick={() =>
                    signedIn &&
                    react.mutate(
                      { id: activity.id, key },
                      { onError: (error) => toast.error(getErrorMessage(error)) },
                    )
                  }
                  className={cn(
                    'inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs tabular-nums transition-colors',
                    active
                      ? 'bg-primary-soft text-primary-soft-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    !signedIn && 'cursor-default hover:bg-transparent',
                  )}
                >
                  <Icon aria-hidden className="size-3.5" />
                  {count ? formatNumber(count) : null}
                </button>
              </Tooltip>
            );
          })}
          {linkToDetails ? (
            <Link
              href={`/feed/${activity.id}`}
              className="ml-auto inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={`Комментарии: ${activity.commentsCount}`}
            >
              <MessageSquare aria-hidden className="size-3.5" />
              {activity.commentsCount ? formatNumber(activity.commentsCount) : null}
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function ActivityFeed({ username, emptyText }: { username?: string; emptyText: string }) {
  const query = useActivityFeed(username);
  const items = query.data?.pages.flatMap((page) => page.items ?? []) ?? [];
  if (query.isPending) return <SkeletonRows rows={4} />;
  if (query.isError)
    return <ErrorState error={query.error} onRetry={() => query.refetch()} size="sm" />;
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<UserPlus />}
        title="Пока пусто"
        description={emptyText}
        className="min-h-0 py-8"
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col divide-y divide-border-subtle" data-testid="activity-feed">
        {items.map((activity) => (
          <ActivityCard key={activity.id} activity={activity} />
        ))}
      </div>
      {query.hasNextPage ? (
        <Button
          size="sm"
          variant="secondary"
          className="self-center"
          loading={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          Показать ещё
        </Button>
      ) : null}
    </div>
  );
}
