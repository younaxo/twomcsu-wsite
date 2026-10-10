'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, ThumbsDown, ThumbsUp, type LucideIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { toast } from '@/components/ui/toast';
import { Tooltip } from '@/components/ui/tooltip';
import { api } from '@/lib/api/client';
import { getErrorMessage } from '@/lib/api/errors';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import type { ProfileStatsDto, PublicProfileResponse } from '@/lib/profile/hooks';

/// Метрики профиля (B5, D5) — один компактный solid-контейнер в правом верхнем
/// углу баннера: просмотры (только показатель), «нравится» и «не нравится».
/// Просмотр отправляется один раз за открытие страницы, только вошедшим и не
/// владельцем (сервер всё равно не считает свой просмотр и дубли). Оценка — одна;
/// свой профиль — просто счётчики без действий, гость — недоступно с подсказкой.

type Reaction = 'LIKE' | 'DISLIKE';

const REACTIONS: Record<Reaction, { icon: LucideIcon; label: string; active: string }> = {
  LIKE: { icon: ThumbsUp, label: 'Нравится', active: 'text-success' },
  DISLIKE: { icon: ThumbsDown, label: 'Не нравится', active: 'text-destructive' },
};

const cell = 'inline-flex h-7 items-center gap-1 rounded-sm px-1.5 tabular-nums';

export function ProfileMetrics({
  handle,
  stats,
  own,
  signedIn,
  className,
}: {
  handle: string;
  stats: ProfileStatsDto;
  own: boolean;
  signedIn: boolean;
  className?: string;
}) {
  const client = useQueryClient();
  const key = ['profile', 'public', handle.toLowerCase()] as const;
  const apply = (next: ProfileStatsDto) =>
    client.setQueryData<PublicProfileResponse>(key, (prev) =>
      prev && !prev.hidden ? { ...prev, stats: next } : prev,
    );
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
    mutationFn: (type: Reaction | null) =>
      api.put<ProfileStatsDto>(`/users/${encodeURIComponent(handle)}/reaction`, { type }),
    onSuccess: apply,
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const reaction = (type: Reaction) => {
    const { icon: Icon, label, active: activeClass } = REACTIONS[type];
    const count = type === 'LIKE' ? stats.likes : stats.dislikes;
    const active = stats.myReaction === type;
    const content = (
      <>
        <Icon aria-hidden className="size-3.5" />
        {formatNumber(count)}
      </>
    );
    // Свой профиль: оценить себя нельзя — недоступное действие (not-allowed,
    // наш Tooltip), запрос не отправляется.
    if (own) {
      return (
        <Tooltip key={type} content="Нельзя оценить собственный профиль">
          <button
            type="button"
            aria-label={`${label}: ${count}`}
            aria-disabled="true"
            data-own-reaction={type}
            onClick={(event) => event.preventDefault()}
            className={cn(cell, 'cursor-not-allowed text-muted-foreground')}
          >
            {content}
          </button>
        </Tooltip>
      );
    }
    const pending = react.isPending && react.variables === (active ? null : type);
    const control = (
      <button
        type="button"
        aria-pressed={active}
        aria-label={`${label}: ${count}`}
        aria-disabled={!signedIn || undefined}
        aria-busy={pending || undefined}
        onClick={() => {
          if (!signedIn || react.isPending) return;
          react.mutate(active ? null : type);
        }}
        className={cn(
          cell,
          'transition-colors duration-fast',
          signedIn
            ? 'hover:bg-surface-sunken hover:text-foreground'
            : 'cursor-not-allowed opacity-70',
          active ? activeClass : 'text-muted-foreground',
          pending && 'opacity-60',
        )}
      >
        {content}
      </button>
    );
    return signedIn ? (
      <span key={type}>{control}</span>
    ) : (
      <Tooltip key={type} content="Войдите, чтобы оценить профиль">
        {control}
      </Tooltip>
    );
  };

  return (
    <div
      role="group"
      aria-label="Активность профиля"
      data-testid="profile-metrics"
      className={cn(
        'inline-flex items-center gap-0.5 rounded-md bg-surface p-0.5 text-xs shadow-sm',
        className,
      )}
    >
      <span className={cn(cell, 'text-muted-foreground')} aria-label={`Просмотров: ${stats.views}`}>
        <Eye aria-hidden className="size-3.5" />
        {formatNumber(stats.views)}
      </span>
      <span aria-hidden className="h-4 w-px bg-border-subtle" />
      {reaction('LIKE')}
      {reaction('DISLIKE')}
    </div>
  );
}
