'use client';

import type { PublicProfileSummary } from '@twomc/shared';
import { EyeOff, Gamepad2, ShieldCheck } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Avatar } from '@/components/ui/avatar';
import {
  BottomSheet,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Skeleton } from '@/components/ui/skeleton';
import { UserIdentity } from '@/components/ui/user-identity';
import { cn } from '@/lib/cn';
import { formatDate, formatNumber, formatRelative } from '@/lib/format';
import { useProfileSummary } from '@/lib/profile/hooks';
import { pickPrimaryRole } from '@/lib/roles/primary-role';
import { useIsCoarsePointer, useIsMobile } from '@/lib/use-media-query';

/// Превью профиля по нику (ADR-0073): desktop — hover card (наведение и фокус
/// с клавиатуры), touch/mobile — нижний sheet по нажатию. Данные — только
/// реальные (`GET /users/:username/summary`), запрос — при открытии.

function playTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${formatNumber(hours)} ч ${minutes % 60} мин` : `${minutes} мин`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-lg bg-surface-sunken px-3 py-2">
      <span className="truncate text-xs text-muted-foreground">{label}</span>
      <span className="truncate font-semibold tabular-nums">{value}</span>
    </div>
  );
}

export function ProfilePreviewCard({
  username,
  summary,
  loading,
  error,
}: {
  username: string;
  summary: PublicProfileSummary | undefined;
  loading: boolean;
  error: boolean;
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-3" data-testid="profile-preview-loading">
        <div className="flex items-center gap-3">
          <Skeleton className="size-12 rounded-lg" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }
  if (error || !summary) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Не удалось загрузить профиль {username}. Попробуйте позже.
      </p>
    );
  }
  if (summary.hidden) {
    return (
      <div className="flex items-center gap-3" data-testid="profile-preview-hidden">
        <span className="flex size-10 items-center justify-center rounded-lg bg-surface-sunken">
          <EyeOff aria-hidden className="size-5 text-subtle-foreground" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium">{summary.username}</p>
          <p className="text-sm text-muted-foreground">Профиль скрыт настройками приватности.</p>
        </div>
      </div>
    );
  }
  const role = pickPrimaryRole(summary.roles);
  return (
    <div className="flex flex-col gap-3" data-testid="profile-preview">
      <div className="flex items-start gap-3">
        <Avatar src={summary.avatar ?? undefined} name={summary.username} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <UserIdentity username={summary.username} role={role} tag={summary.tag} prefixSize="sm" />
          {summary.position ? (
            <span
              className="max-w-full truncate text-xs font-medium"
              style={{ color: summary.position.color }}
              title={summary.position.displayName}
            >
              {summary.position.displayName}
            </span>
          ) : null}
        </div>
      </div>
      {summary.system ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck aria-hidden className="size-4 text-primary" />
          Системный аккаунт twomc.su
        </p>
      ) : (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className={cn(
                'size-2 rounded-full',
                summary.online ? 'bg-success' : 'bg-border-strong',
              )}
            />
            {summary.online
              ? summary.currentServer
                ? `В игре · ${summary.currentServer}`
                : 'В игре'
              : summary.lastActivityAt
                ? `Был(а) ${formatRelative(summary.lastActivityAt)}`
                : 'Не в игре'}
          </span>
          <span aria-hidden>·</span>
          <span>На сайте с {formatDate(summary.createdAt)}</span>
        </p>
      )}
      {summary.banned ? (
        <p className="rounded bg-destructive-soft px-2.5 py-1.5 text-xs text-destructive">
          Аккаунт заблокирован
        </p>
      ) : null}
      {summary.statistics ? (
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Время в игре" value={playTime(summary.statistics.playTimeMinutes)} />
          <Stat label="K/D" value={summary.statistics.killDeathRatio.toFixed(2)} />
          <Stat label="Убийства" value={formatNumber(summary.statistics.kills)} />
          <Stat label="Смерти" value={formatNumber(summary.statistics.deaths)} />
        </div>
      ) : (
        <p className="flex items-center gap-2 text-xs text-subtle-foreground">
          <Gamepad2 aria-hidden className="size-4" />
          {summary.statisticsHidden ? 'Игрок скрыл статистику.' : 'Игровой статистики пока нет.'}
        </p>
      )}
      <dl className="flex gap-4 text-sm">
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">Друзья</dt>
          <dd className="font-semibold tabular-nums">{formatNumber(summary.friendsCount)}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">Достижения</dt>
          <dd className="font-semibold tabular-nums">
            {formatNumber(summary.achievementsCompleted)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

/// Оборачивает элемент с ником: `<ProfilePreview username="x"><button>x</button></ProfilePreview>`.
/// Триггер должен быть фокусируемым (button/ссылка).
export function ProfilePreview({
  username,
  children,
}: {
  username: string;
  children: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const mobile = useIsMobile();
  const coarse = useIsCoarsePointer();
  const query = useProfileSummary(username, open);
  const card = (
    <ProfilePreviewCard
      username={username}
      summary={query.data}
      loading={query.isPending}
      error={query.isError}
    />
  );

  if (mobile || coarse) {
    return (
      <>
        <span
          onClickCapture={(event) => {
            // Нажатие на ник открывает превью, а не действие строки/ссылки.
            event.preventDefault();
            event.stopPropagation();
            setOpen(true);
          }}
          className="contents"
        >
          {children}
        </span>
        <BottomSheet open={open} onOpenChange={setOpen}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>{username}</DrawerTitle>
              <DrawerDescription className="sr-only">Профиль игрока</DrawerDescription>
            </DrawerHeader>
            <DrawerBody className="pb-[max(1.5rem,env(safe-area-inset-bottom))]">{card}</DrawerBody>
          </DrawerContent>
        </BottomSheet>
      </>
    );
  }

  return (
    <HoverCard open={open} onOpenChange={setOpen}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent className="w-80" aria-label={`Профиль ${username}`}>
        {card}
      </HoverCardContent>
    </HoverCard>
  );
}
