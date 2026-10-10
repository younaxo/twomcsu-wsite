'use client';

import type { FriendUserDto } from '@twomc/shared';
import { Ban, Check, Inbox, Send, UserMinus, Users, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type ReactNode } from 'react';
import { RequireSession } from '@/components/auth/require-session';
import { PageHeader } from '@/components/admin/page-header';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { SkeletonRows } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UserIdentity } from '@/components/ui/user-identity';
import { formatDate } from '@/lib/format';
import {
  useBlockedUsers,
  useFriendAction,
  useFriends,
  useIncomingRequests,
  useIncomingRequestsCount,
  useOutgoingRequests,
} from '@/lib/friends/hooks';
import { formatBadgeCount } from '@/lib/site/document-badge';

/// «Друзья» (срез 2.1, ADR-0108): вкладки «Друзья», «Входящие» (со счётчиком),
/// «Исходящие», «Заблокированные». Вкладка — в адресе (`?tab=incoming`), туда же
/// ведёт уведомление о новой заявке. Удаление из друзей и блокировка — только
/// после подтверждения в нашем диалоге.

const TABS = ['friends', 'incoming', 'outgoing', 'blocked'] as const;
type Tab = (typeof TABS)[number];

function isTab(value: string | null): value is Tab {
  return TABS.includes(value as Tab);
}

export default function FriendsPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-3 py-6 md:px-6">
      <PageHeader title="Друзья" description="Друзья, заявки и заблокированные игроки." />
      <RequireSession>
        <Suspense fallback={<SkeletonRows rows={4} />}>
          <FriendsTabs />
        </Suspense>
      </RequireSession>
    </div>
  );
}

function FriendsTabs() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = params.get('tab');
  const tab: Tab = isTab(raw) ? raw : 'friends';
  const count = useIncomingRequestsCount();
  const incoming = count.data?.count ?? 0;

  return (
    <Tabs
      value={tab}
      onValueChange={(next) =>
        router.replace(next === 'friends' ? pathname : `${pathname}?tab=${next}`, {
          scroll: false,
        })
      }
      className="flex flex-col gap-4"
    >
      <TabsList aria-label="Разделы друзей" className="max-w-full overflow-x-auto scrollbar-none">
        <TabsTrigger value="friends">Друзья</TabsTrigger>
        <TabsTrigger value="incoming">
          Входящие
          {incoming > 0 ? (
            <span
              className="ml-1.5 rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-5 text-primary-foreground tabular-nums"
              data-testid="friends-incoming-count"
              aria-label={`новых заявок: ${incoming}`}
            >
              {formatBadgeCount(incoming)}
            </span>
          ) : null}
        </TabsTrigger>
        <TabsTrigger value="outgoing">Исходящие</TabsTrigger>
        <TabsTrigger value="blocked">Заблокированные</TabsTrigger>
      </TabsList>
      <TabsContent value="friends">
        <FriendsList />
      </TabsContent>
      <TabsContent value="incoming">
        <IncomingList />
      </TabsContent>
      <TabsContent value="outgoing">
        <OutgoingList />
      </TabsContent>
      <TabsContent value="blocked">
        <BlockedList />
      </TabsContent>
    </Tabs>
  );
}

/// Строка игрока: аватар, `ник#0000` (превью профиля), подпись и действия.
function PersonRow({
  user,
  meta,
  children,
}: {
  user: FriendUserDto;
  meta: string;
  children?: ReactNode;
}) {
  return (
    <li
      className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3"
      data-testid="friend-row"
      data-user={user.username}
    >
      <Avatar src={user.avatar} name={user.username} size="md" />
      <div className="flex min-w-0 flex-1 basis-40 flex-col">
        <UserIdentity username={user.username} tag={user.tag} previewable />
        <span className="truncate text-xs text-muted-foreground">{meta}</span>
      </div>
      {children ? <div className="flex shrink-0 gap-2">{children}</div> : null}
    </li>
  );
}

function ListFrame<T>({
  query,
  empty,
  children,
}: {
  query: {
    data: T[] | undefined;
    isPending: boolean;
    isError: boolean;
    error: unknown;
    refetch: () => unknown;
  };
  empty: ReactNode;
  children: (items: T[]) => ReactNode;
}) {
  if (query.isPending) return <SkeletonRows rows={3} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const items = query.data ?? [];
  if (items.length === 0) return <>{empty}</>;
  return (
    <ul className="flex flex-col divide-y divide-border-subtle rounded-xl bg-surface shadow-sm">
      {children(items)}
    </ul>
  );
}

function FriendsList() {
  const query = useFriends();
  const action = useFriendAction();
  const [removing, setRemoving] = useState<FriendUserDto | null>(null);
  return (
    <>
      <ListFrame
        query={query}
        empty={
          <EmptyState
            icon={<Users />}
            title="Друзей пока нет"
            description="Откройте профиль игрока и нажмите «В друзья» — после принятия заявки он появится здесь."
          />
        }
      >
        {(items) =>
          items.map((friend) => (
            <PersonRow
              key={friend.user.id}
              user={friend.user}
              meta={friend.since ? `Друзья с ${formatDate(friend.since)}` : 'Друзья'}
            >
              <Button size="sm" variant="ghost" onClick={() => setRemoving(friend.user)}>
                <UserMinus />
                Удалить
              </Button>
            </PersonRow>
          ))
        }
      </ListFrame>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Удалить из друзей?"
        description={
          removing
            ? `${removing.username} пропадёт из списка друзей. Добавиться снова можно новой заявкой.`
            : undefined
        }
        confirmLabel="Удалить"
        destructive
        onConfirm={async () => {
          if (removing) await action.mutateAsync({ kind: 'remove', userId: removing.id });
        }}
      />
    </>
  );
}

function IncomingList() {
  const query = useIncomingRequests();
  const action = useFriendAction();
  return (
    <ListFrame
      query={query}
      empty={
        <EmptyState
          icon={<Inbox />}
          title="Новых заявок нет"
          description="Когда кто-то захочет добавить вас в друзья, заявка появится здесь."
        />
      }
    >
      {(items) =>
        items.map((item) => (
          <PersonRow
            key={item.id}
            user={item.user}
            meta={`Заявка от ${formatDate(item.createdAt)}`}
          >
            <Button
              size="sm"
              disabled={action.isPending}
              onClick={() => action.mutate({ kind: 'accept', requestId: item.id })}
            >
              <Check />
              Принять
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={action.isPending}
              onClick={() => action.mutate({ kind: 'decline', requestId: item.id })}
            >
              <X />
              Отклонить
            </Button>
          </PersonRow>
        ))
      }
    </ListFrame>
  );
}

function OutgoingList() {
  const query = useOutgoingRequests();
  const action = useFriendAction();
  return (
    <ListFrame
      query={query}
      empty={
        <EmptyState
          icon={<Send />}
          title="Отправленных заявок нет"
          description="Заявки, которые вы отправили и которые ещё не приняты, видны здесь."
        />
      }
    >
      {(items) =>
        items.map((item) => (
          <PersonRow
            key={item.id}
            user={item.user}
            meta={`Отправлена ${formatDate(item.createdAt)}`}
          >
            <Button
              size="sm"
              variant="ghost"
              disabled={action.isPending}
              onClick={() => action.mutate({ kind: 'cancel', requestId: item.id })}
            >
              <X />
              Отменить
            </Button>
          </PersonRow>
        ))
      }
    </ListFrame>
  );
}

function BlockedList() {
  const query = useBlockedUsers();
  const action = useFriendAction();
  return (
    <ListFrame
      query={query}
      empty={
        <EmptyState
          icon={<Ban />}
          title="Заблокированных нет"
          description="Заблокированный игрок не видит ваш профиль и не может отправить заявку."
        />
      }
    >
      {(items) =>
        items.map((item) => (
          <PersonRow
            key={item.user.id}
            user={item.user}
            meta={`В блокировке с ${formatDate(item.blockedAt)}`}
          >
            <Button
              size="sm"
              variant="ghost"
              disabled={action.isPending}
              onClick={() => action.mutate({ kind: 'unblock', userId: item.user.id })}
            >
              Разблокировать
            </Button>
          </PersonRow>
        ))
      }
    </ListFrame>
  );
}
