'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { Tooltip } from '@/components/ui/tooltip';
import { api } from '@/lib/api/client';
import { getErrorMessage } from '@/lib/api/errors';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import type { ProfileStatsDto, PublicProfileDto } from '@/lib/profile/hooks';

/// Просмотры и реакции профиля (B5). Просмотр отправляется один раз за
/// открытие страницы, только вошедшим и не владельцем (сервер всё равно не
/// считает свой просмотр и дубли). Лайк/дизлайк — одна реакция; свой профиль и
/// аноним — кнопки недоступны с пояснением.
export function ProfileEngagement({
  handle,
  stats,
  own,
  signedIn,
}: {
  handle: string;
  stats: ProfileStatsDto;
  own: boolean;
  signedIn: boolean;
}) {
  const client = useQueryClient();
  const key = ['profile', 'public', handle.toLowerCase()] as const;
  const apply = (next: ProfileStatsDto) =>
    client.setQueryData<PublicProfileDto>(key, (prev) => (prev ? { ...prev, stats: next } : prev));
  const sent = useRef(false);

  useEffect(() => {
    if (!signedIn || own || sent.current) return;
    sent.current = true;
    void api
      .post<ProfileStatsDto>(`/users/${encodeURIComponent(handle)}/view`)
      .then(apply)
      .catch(() => undefined);
    // Один раз за открытие страницы.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, own, handle]);

  const react = useMutation({
    mutationFn: (type: 'LIKE' | 'DISLIKE' | null) =>
      api.put<ProfileStatsDto>(`/users/${encodeURIComponent(handle)}/reaction`, { type }),
    onSuccess: apply,
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const locked = own || !signedIn;
  const hint = own ? 'Свой профиль оценить нельзя' : 'Войдите, чтобы оценить профиль';
  const button = (type: 'LIKE' | 'DISLIKE') => {
    const active = stats.myReaction === type;
    const Icon = type === 'LIKE' ? ThumbsUp : ThumbsDown;
    const count = type === 'LIKE' ? stats.likes : stats.dislikes;
    const label = type === 'LIKE' ? 'Нравится' : 'Не нравится';
    const control = (
      <Button
        size="sm"
        variant={active ? 'secondary' : 'ghost'}
        aria-pressed={active}
        aria-label={`${label}: ${count}`}
        aria-disabled={locked || undefined}
        loading={react.isPending && react.variables === (active ? null : type)}
        onClick={() => {
          if (locked) return;
          react.mutate(active ? null : type);
        }}
        className={cn(
          'tabular-nums',
          active && (type === 'LIKE' ? 'text-success' : 'text-destructive'),
        )}
      >
        <Icon />
        {formatNumber(count)}
      </Button>
    );
    return locked ? (
      <Tooltip key={type} content={hint}>
        {control}
      </Tooltip>
    ) : (
      <span key={type}>{control}</span>
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-1" data-testid="profile-engagement">
      <span
        className="mr-2 inline-flex items-center gap-1.5 text-sm tabular-nums text-muted-foreground"
        aria-label={`Просмотров: ${stats.views}`}
      >
        <Eye aria-hidden className="size-4" />
        {formatNumber(stats.views)}
      </span>
      {button('LIKE')}
      {button('DISLIKE')}
    </div>
  );
}
