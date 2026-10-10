'use client';

import type { FriendRelationDto } from '@twomc/shared';
import { Ban, Check, MoreHorizontal, UserCheck, UserMinus, UserPlus, UserX, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button, IconButton } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import {
  friendKeys,
  useFriendAction,
  useFriendRelation,
  type FriendAction,
} from '@/lib/friends/hooks';

/// Кнопка дружбы на профиле (срез 2.1, ADR-0108). Состояние — с сервера
/// (`GET /friends/relation/:username`): основное действие видно сразу, остальное
/// — в меню «⋯». Удаление из друзей и блокировка — только после подтверждения.
/// Чужая блокировка не раскрывается: такой профиль скрыт, кнопки нет.

type Confirm = 'remove' | 'block' | null;

/// Состояние сразу после успешного действия — без мигания старой кнопки, пока
/// перезапрашивается `relation` (и без повторной заявки → 409).
export function relationAfter(
  relation: FriendRelationDto,
  action: FriendAction,
  data: unknown,
): FriendRelationDto {
  const base = { userId: relation.userId, requestId: null };
  switch (action.kind) {
    case 'send': {
      const id = (data as { id?: string } | null)?.id ?? null;
      return { ...base, status: 'OUTGOING', requestId: id };
    }
    case 'accept':
      return { ...base, status: 'FRIENDS' };
    case 'block':
      return { ...base, status: 'BLOCKED' };
    default:
      return { ...base, status: 'NONE' };
  }
}

export function FriendButton({ username }: { username: string }) {
  const relation = useFriendRelation(username);
  if (relation.isPending) {
    return (
      <Skeleton className="h-control-sm w-28 rounded-md" data-testid="friend-button-loading" />
    );
  }
  // Ошибка (модуль друзей выключен, сеть) — без кнопки, профиль остаётся рабочим.
  if (relation.isError || !relation.data || relation.data.status === 'SELF') return null;
  return <FriendControls username={username} relation={relation.data} />;
}

export function FriendControls({
  username,
  relation,
}: {
  username: string;
  relation: FriendRelationDto;
}) {
  const action = useFriendAction();
  const client = useQueryClient();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const apply = (next: FriendAction, data: unknown) =>
    client.setQueryData(friendKeys.relation(username), relationAfter(relation, next, data));
  const run = (next: FriendAction) =>
    action.mutate(next, { onSuccess: (data) => apply(next, data) });
  const runConfirmed = async (next: FriendAction) => {
    apply(next, await action.mutateAsync(next));
  };
  const busy = action.isPending;
  const { status, requestId, userId } = relation;

  const primary = (() => {
    switch (status) {
      case 'NONE':
        return (
          <Button size="sm" loading={busy} onClick={() => run({ kind: 'send', username })}>
            <UserPlus />В друзья
          </Button>
        );
      case 'OUTGOING':
        return (
          <Button
            size="sm"
            variant="secondary"
            loading={busy}
            onClick={() => requestId && run({ kind: 'cancel', requestId })}
          >
            <UserX />
            Отменить заявку
          </Button>
        );
      case 'INCOMING':
        return (
          <>
            <Button
              size="sm"
              loading={busy}
              onClick={() => requestId && run({ kind: 'accept', requestId })}
            >
              <Check />
              Принять заявку
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => requestId && run({ kind: 'decline', requestId })}
            >
              <X />
              Отклонить
            </Button>
          </>
        );
      case 'FRIENDS':
        return (
          <span
            className="inline-flex h-control-sm items-center gap-1.5 rounded-md bg-success-soft px-3 text-sm font-medium text-success"
            data-testid="friend-status"
          >
            <UserCheck aria-hidden className="size-4" />В друзьях
          </span>
        );
      case 'BLOCKED':
        return (
          <Button
            size="sm"
            variant="secondary"
            loading={busy}
            onClick={() => run({ kind: 'unblock', userId })}
          >
            Разблокировать
          </Button>
        );
      default:
        return null;
    }
  })();

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-testid="friend-button"
      data-status={status}
    >
      {primary}
      {status !== 'BLOCKED' ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton size="sm" variant="secondary" aria-label="Ещё действия" disabled={busy}>
              <MoreHorizontal />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {status === 'FRIENDS' ? (
              <DropdownMenuItem onSelect={() => setConfirm('remove')}>
                <UserMinus />
                Удалить из друзей
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirm('block')}>
              <Ban />
              Заблокировать
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <ConfirmDialog
        open={confirm === 'remove'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Удалить из друзей?"
        description={`${username} пропадёт из списка друзей. Добавиться снова можно новой заявкой.`}
        confirmLabel="Удалить"
        destructive
        onConfirm={() => runConfirmed({ kind: 'remove', userId })}
      />
      <ConfirmDialog
        open={confirm === 'block'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`Заблокировать ${username}?`}
        description="Игрок пропадёт из друзей, заявки между вами удалятся. Он не увидит ваш профиль и не сможет отправить заявку. Разблокировать можно в «Друзья → Заблокированные»."
        confirmLabel="Заблокировать"
        destructive
        onConfirm={() => runConfirmed({ kind: 'block', userId })}
      />
    </div>
  );
}
