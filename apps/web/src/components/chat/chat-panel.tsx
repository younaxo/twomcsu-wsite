'use client';

import type {
  ChatChannelDto,
  ChatMessageDto,
  ChatMessagesPage,
  ChatOnlineDto,
} from '@twomc/shared';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pin, SendHorizontal, Users } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { io, type Socket } from 'socket.io-client';
import { Avatar } from '@/components/ui/avatar';
import { Button, IconButton } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { Textarea } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { SkeletonRows } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { Tooltip } from '@/components/ui/tooltip';
import { api } from '@/lib/api/client';
import { tokenStore } from '@/lib/api/token-store';
import { useAuthStore } from '@/lib/auth/store';
import { cn } from '@/lib/cn';
import { API_URL } from '@/lib/env';
import { formatDateTime, formatNumber } from '@/lib/format';

/// Общий чат (срез 2.5, ADR-0113): каналы, история «Загрузить раньше»,
/// закреплённое, онлайн, отправка через WS `/chat` с ack. Гость читает, писать
/// — после входа. Мут и бан приходят событиями и показываются в поле ввода.
/// Текст — простой, без HTML.

const CONTENT_MAX = 2000;
const PAGE_SIZE = 30;

const chatKeys = {
  channels: ['chat', 'channels'] as const,
  history: (slug: string) => ['chat', 'history', slug] as const,
  pinned: (slug: string) => ['chat', 'pinned', slug] as const,
  online: (slug: string) => ['chat', 'online', slug] as const,
};

type Restriction = { kind: 'muted' | 'banned'; until: string | null; reason: string | null };

function useChatSocket(channel: ChatChannelDto | null, onRestriction: (r: Restriction) => void) {
  const client = useQueryClient();
  const meId = useAuthStore((state) => state.user?.id ?? null);
  const authenticated = useAuthStore((state) => state.status === 'authenticated');
  const [socket, setSocket] = useState<Socket | null>(null);
  const restrict = useRef(onRestriction);
  restrict.current = onRestriction;

  useEffect(() => {
    const token = tokenStore.get();
    if (!channel || !authenticated || !token) return;
    const connection = io(`${API_URL}/chat`, {
      auth: { token },
      transports: ['websocket'],
      reconnectionAttempts: 3,
    });
    const refresh = () => {
      void client.invalidateQueries({ queryKey: chatKeys.history(channel.slug) });
      void client.invalidateQueries({ queryKey: chatKeys.pinned(channel.slug) });
    };
    connection.on('connect', () => connection.emit('join_channel', { channelId: channel.id }));
    connection.on('connect_error', (error: Error) => {
      if (/Забанен/.test(error.message)) {
        restrict.current({ kind: 'banned', until: null, reason: null });
      }
    });
    connection.on('message:new', refresh);
    connection.on('message:edited', refresh);
    connection.on('message:deleted', refresh);
    connection.on('message:pinned', refresh);
    connection.on('user:online', () =>
      client.invalidateQueries({ queryKey: chatKeys.online(channel.slug) }),
    );
    connection.on('user:offline', () =>
      client.invalidateQueries({ queryKey: chatKeys.online(channel.slug) }),
    );
    connection.on(
      'user:muted',
      (payload: { userId?: string; expiresAt?: string | null; reason?: string | null }) => {
        if (payload?.userId !== meId) return;
        restrict.current({
          kind: 'muted',
          until: payload.expiresAt ?? null,
          reason: payload.reason ?? null,
        });
      },
    );
    connection.on(
      'user:banned',
      (payload: { userId?: string; expiresAt?: string | null; reason?: string | null }) => {
        if (payload?.userId !== meId) return;
        restrict.current({
          kind: 'banned',
          until: payload.expiresAt ?? null,
          reason: payload.reason ?? null,
        });
      },
    );
    setSocket(connection);
    return () => {
      connection.emit('leave_channel', { channelId: channel.id });
      connection.disconnect();
      setSocket(null);
    };
  }, [authenticated, channel, client, meId]);

  return socket;
}

function MessageRow({ message }: { message: ChatMessageDto }) {
  const name = message.author?.username ?? 'Игрок';
  return (
    <li className="flex gap-2.5" data-testid="chat-message">
      <Avatar src={message.author?.avatar ?? null} name={name} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          {message.author ? (
            <Link
              href={`/u/${encodeURIComponent(message.author.username)}`}
              className="truncate text-sm font-medium hover:underline"
            >
              {name}
            </Link>
          ) : (
            <span className="truncate text-sm font-medium">{name}</span>
          )}
          <Tooltip content={formatDateTime(message.createdAt)}>
            <time
              dateTime={message.createdAt}
              className="shrink-0 text-[11px] text-subtle-foreground"
            >
              {new Date(message.createdAt).toLocaleTimeString('ru-RU', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </time>
          </Tooltip>
          {message.isEdited ? (
            <span className="text-[11px] text-subtle-foreground">изменено</span>
          ) : null}
        </div>
        <p className="whitespace-pre-wrap break-words text-sm" data-testid="chat-message-content">
          {message.content}
        </p>
      </div>
    </li>
  );
}

function restrictionText(restriction: Restriction): string {
  const until = restriction.until ? ` до ${formatDateTime(restriction.until)}` : '';
  const reason = restriction.reason ? ` Причина: ${restriction.reason}.` : '';
  return restriction.kind === 'banned'
    ? `Вы заблокированы в чате${until}.${reason}`
    : `Модератор запретил вам писать${until}.${reason}`;
}

function ChannelView({ channel }: { channel: ChatChannelDto }) {
  const signedIn = useAuthStore((state) => state.status === 'authenticated');
  const [restriction, setRestriction] = useState<Restriction | null>(null);
  const socket = useChatSocket(channel, setRestriction);
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  const history = useInfiniteQuery({
    queryKey: chatKeys.history(channel.slug),
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.get<ChatMessagesPage>(`/chat/channels/${encodeURIComponent(channel.slug)}/messages`, {
        query: { page: pageParam, limit: PAGE_SIZE },
        auth: false,
      }),
    getNextPageParam: (last) => (last.page * last.limit < last.total ? last.page + 1 : undefined),
    // Гость без сокета — история обновляется опросом.
    refetchInterval: signedIn ? false : 15_000,
  });
  const pinned = useQuery({
    queryKey: chatKeys.pinned(channel.slug),
    queryFn: () =>
      api.get<ChatMessageDto[]>(`/chat/channels/${encodeURIComponent(channel.slug)}/pinned`, {
        auth: false,
      }),
  });
  const online = useQuery({
    queryKey: chatKeys.online(channel.slug),
    queryFn: () =>
      api.get<ChatOnlineDto>(`/chat/channels/${encodeURIComponent(channel.slug)}/online`, {
        auth: false,
      }),
    refetchInterval: 30_000,
  });
  const messages = [...(history.data?.pages ?? [])].reverse().flatMap((page) => page.items ?? []);
  const lastId = messages.at(-1)?.id;

  useEffect(() => {
    if (lastId) bottom.current?.scrollIntoView?.({ block: 'end' });
  }, [lastId]);

  const send = async () => {
    const text = content.trim();
    if (!text || sending || !socket?.connected) return;
    setSending(true);
    try {
      const ack = (await socket
        .timeout(8000)
        .emitWithAck('send_message', { channelId: channel.id, content: text })) as {
        ok: boolean;
        error?: string;
      };
      if (!ack?.ok) throw new Error(ack?.error ?? 'Не удалось отправить сообщение');
      setContent('');
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  };

  const top = pinned.data?.[0];
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="chat-channel">
      <div className="flex items-center justify-between gap-2 px-4 pb-2 text-xs text-muted-foreground">
        <span className="truncate">{channel.description ?? ''}</span>
        <span className="flex shrink-0 items-center gap-1" data-testid="chat-online">
          <Users aria-hidden className="size-3.5" />
          {formatNumber(online.data?.count ?? 0)} в канале
        </span>
      </div>
      {top ? (
        <div
          className="mx-4 mb-2 flex items-start gap-2 rounded-lg bg-surface-sunken px-3 py-2 text-xs"
          data-testid="chat-pinned"
        >
          <Pin aria-hidden className="mt-0.5 size-3.5 shrink-0 text-primary" />
          <p className="line-clamp-2 break-words">
            <span className="font-medium">{top.author?.username ?? 'Игрок'}: </span>
            {top.content}
          </p>
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-2">
        {history.hasNextPage ? (
          <Button
            size="sm"
            variant="ghost"
            className="self-center"
            loading={history.isFetchingNextPage}
            onClick={() => void history.fetchNextPage()}
          >
            Загрузить раньше
          </Button>
        ) : null}
        {history.isPending ? (
          <SkeletonRows rows={5} />
        ) : history.isError ? (
          <ErrorState error={history.error} onRetry={() => history.refetch()} size="sm" />
        ) : messages.length === 0 ? (
          <p className="m-auto text-sm text-muted-foreground">В канале пока тихо.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {messages.map((message) => (
              <MessageRow key={message.id} message={message} />
            ))}
          </ul>
        )}
        <div ref={bottom} />
      </div>
      <div className="border-t border-border-subtle p-3">
        {!signedIn ? (
          <p className="text-sm text-muted-foreground" data-testid="chat-sign-in">
            <Link
              href="/login"
              className="font-medium text-primary-soft-foreground hover:underline"
            >
              Войдите
            </Link>
            , чтобы писать в чат.
          </p>
        ) : restriction ? (
          <p className="text-sm text-destructive" role="status" data-testid="chat-restricted">
            {restrictionText(restriction)}
          </p>
        ) : channel.isReadOnly ? (
          <p className="text-sm text-muted-foreground" data-testid="chat-readonly">
            Канал только для чтения.
          </p>
        ) : (
          <form
            className="flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <Textarea
              aria-label="Сообщение в чат"
              placeholder="Сообщение…"
              value={content}
              maxLength={CONTENT_MAX}
              rows={1}
              className="max-h-32 min-h-control flex-1"
              onKeyDown={onKeyDown}
              onChange={(event) => setContent(event.target.value)}
            />
            <IconButton
              type="submit"
              aria-label="Отправить в чат"
              variant="primary"
              loading={sending}
              disabled={!content.trim() || !socket}
            >
              <SendHorizontal />
            </IconButton>
          </form>
        )}
      </div>
    </div>
  );
}

export function ChatPanel() {
  const channels = useQuery({
    queryKey: chatKeys.channels,
    queryFn: () => api.get<ChatChannelDto[]>('/chat/channels', { auth: false }),
  });
  const [slug, setSlug] = useState<string | null>(null);
  const list = channels.data ?? [];
  const active = list.find((channel) => channel.slug === slug) ?? list[0] ?? null;

  if (channels.isPending) return <SkeletonRows rows={6} />;
  if (channels.isError) {
    return <ErrorState error={channels.error} onRetry={() => channels.refetch()} size="sm" />;
  }
  if (!active) {
    return (
      <p className="p-4 text-sm text-muted-foreground" data-testid="chat-no-channels">
        Каналов чата пока нет.
      </p>
    );
  }
  return (
    <div className={cn('flex h-full min-h-0 flex-col gap-2')} data-testid="chat-panel">
      {list.length > 1 ? (
        <div className="px-4">
          <SegmentedControl
            size="sm"
            value={active.slug}
            onValueChange={setSlug}
            options={list.map((channel) => ({ value: channel.slug, label: channel.name }))}
          />
        </div>
      ) : null}
      <ChannelView key={active.id} channel={active} />
    </div>
  );
}
