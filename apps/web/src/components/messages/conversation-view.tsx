'use client';

import type { DirectMessageDto, MessageReactionKey } from '@twomc/shared';
import { MESSAGE_REACTIONS } from '@twomc/shared';
import {
  ArrowLeft,
  Flame,
  Heart,
  Laugh,
  Link2,
  LogOut,
  MoreHorizontal,
  Pencil,
  SendHorizontal,
  Sparkles,
  ThumbsUp,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Avatar } from '@/components/ui/avatar';
import { Button, IconButton } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ErrorState } from '@/components/ui/error-state';
import { Textarea } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { Tooltip } from '@/components/ui/tooltip';
import { getErrorMessage } from '@/lib/api/errors';
import { useAuthStore } from '@/lib/auth/store';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';
import {
  flattenHistory,
  useConversation,
  useMessageActions,
  useMessageHistory,
} from '@/lib/messages/hooks';
import { useConversationSocket } from '@/lib/messages/socket';

/// Окно беседы (срез 2.4, ADR-0112): история (свежие внизу, «Загрузить
/// раньше»), свои сообщения справа; правка и удаление своих (удаление — с
/// подтверждением), реакции иконками lucide (без emoji, ADR-0085), «печатает…»,
/// Enter — отправить, Shift+Enter — новая строка; группа — приглашение и выход.

const CONTENT_MAX = 4000;

const REACTIONS: Record<MessageReactionKey, { icon: LucideIcon; label: string }> = {
  like: { icon: ThumbsUp, label: 'Нравится' },
  heart: { icon: Heart, label: 'Сердце' },
  laugh: { icon: Laugh, label: 'Смешно' },
  fire: { icon: Flame, label: 'Огонь' },
  wow: { icon: Sparkles, label: 'Впечатляет' },
};

function MessageBubble({
  message,
  mine,
  senderName,
  meId,
  actions,
}: {
  message: DirectMessageDto;
  mine: boolean;
  senderName: string;
  meId: string | null;
  actions: ReturnType<typeof useMessageActions>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [confirm, setConfirm] = useState(false);
  const counts = useMemo(() => {
    const map = new Map<string, { count: number; mine: boolean }>();
    for (const reaction of message.reactions ?? []) {
      const entry = map.get(reaction.emoji) ?? { count: 0, mine: false };
      entry.count += 1;
      entry.mine ||= reaction.userId === meId;
      map.set(reaction.emoji, entry);
    }
    return map;
  }, [message.reactions, meId]);

  if (message.isDeleted) {
    return (
      <li className={cn('flex', mine && 'justify-end')} data-testid="message">
        <p className="rounded-lg px-3 py-2 text-xs italic text-subtle-foreground">
          Сообщение удалено
        </p>
      </li>
    );
  }

  return (
    <li className={cn('group flex gap-2', mine && 'flex-row-reverse')} data-testid="message">
      <div className={cn('flex max-w-[85%] flex-col gap-1', mine && 'items-end')}>
        {!mine ? <span className="px-1 text-xs text-muted-foreground">{senderName}</span> : null}
        {editing ? (
          <form
            className="flex w-72 max-w-full flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const content = draft.trim();
              if (!content) return;
              actions.edit.mutate(
                { messageId: message.id, content },
                {
                  onSuccess: () => setEditing(false),
                  onError: (error) => toast.error(getErrorMessage(error)),
                },
              );
            }}
          >
            <Textarea
              aria-label="Текст сообщения"
              value={draft}
              maxLength={CONTENT_MAX}
              rows={2}
              autoFocus
              onChange={(event) => setDraft(event.target.value)}
            />
            <div className="flex gap-2">
              <Button size="sm" type="submit" loading={actions.edit.isPending}>
                Сохранить
              </Button>
              <Button size="sm" variant="ghost" type="button" onClick={() => setEditing(false)}>
                Отмена
              </Button>
            </div>
          </form>
        ) : (
          <div
            className={cn(
              'rounded-2xl px-3 py-2 text-sm',
              mine ? 'bg-primary text-primary-foreground' : 'bg-surface-sunken',
            )}
          >
            <p className="whitespace-pre-wrap break-words" data-testid="message-content">
              {message.content}
            </p>
            <Tooltip content={formatDateTime(message.createdAt)}>
              <time
                dateTime={message.createdAt}
                className={cn(
                  'mt-0.5 block text-[11px]',
                  mine ? 'text-primary-foreground/70' : 'text-subtle-foreground',
                )}
              >
                {new Date(message.createdAt).toLocaleTimeString('ru-RU', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                {message.isEdited ? ' · изменено' : ''}
              </time>
            </Tooltip>
          </div>
        )}
        {counts.size > 0 ? (
          <div className="flex flex-wrap gap-1">
            {MESSAGE_REACTIONS.filter((key) => counts.has(key)).map((key) => {
              const { icon: Icon, label } = REACTIONS[key];
              const entry = counts.get(key)!;
              return (
                <button
                  key={key}
                  type="button"
                  aria-label={`${label}: ${entry.count}`}
                  aria-pressed={entry.mine}
                  onClick={() => actions.react.mutate({ messageId: message.id, key })}
                  className={cn(
                    'inline-flex h-6 items-center gap-1 rounded-full px-2 text-xs tabular-nums',
                    entry.mine
                      ? 'bg-primary-soft text-primary-soft-foreground'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  <Icon aria-hidden className="size-3" />
                  {entry.count}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton
            size="sm"
            aria-label="Действия с сообщением"
            className="self-center opacity-60 group-hover:opacity-100 focus-visible:opacity-100"
          >
            <MoreHorizontal />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={mine ? 'end' : 'start'}>
          <div className="flex gap-0.5 p-1" role="group" aria-label="Реакции">
            {MESSAGE_REACTIONS.map((key) => {
              const { icon: Icon, label } = REACTIONS[key];
              return (
                <DropdownMenuItem
                  key={key}
                  aria-label={label}
                  className="justify-center px-2"
                  onSelect={() =>
                    actions.react.mutate(
                      { messageId: message.id, key },
                      { onError: (error) => toast.error(getErrorMessage(error)) },
                    )
                  }
                >
                  <Icon />
                </DropdownMenuItem>
              );
            })}
          </div>
          {mine ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => {
                  setDraft(message.content);
                  setEditing(true);
                }}
              >
                <Pencil />
                Изменить
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirm(true)}>
                <Trash2 />
                Удалить
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Удалить сообщение?"
        description="Сообщение исчезнет у всех участников беседы."
        confirmLabel="Удалить"
        destructive
        onConfirm={async () => {
          try {
            await actions.remove.mutateAsync(message.id);
          } catch (error) {
            toast.error(getErrorMessage(error));
            throw error;
          }
        }}
      />
    </li>
  );
}

export function ConversationView({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const meId = useAuthStore((state) => state.user?.id ?? null);
  const conversation = useConversation(conversationId);
  const history = useMessageHistory(conversationId);
  const { socket, typing } = useConversationSocket(conversationId);
  const actions = useMessageActions(conversationId, socket);
  const [content, setContent] = useState('');
  const [leaving, setLeaving] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const typingSent = useRef(false);
  const messages = flattenHistory(history.data?.pages);
  const lastId = messages.at(-1)?.id;
  const { mutate: markRead } = actions.markRead;

  const names = useMemo(
    () =>
      new Map(conversation.data?.members.map((member) => [member.userId, member.user.username])),
    [conversation.data],
  );

  // Новое последнее сообщение — прокрутить вниз и отметить прочитанным.
  useEffect(() => {
    if (!lastId) return;
    bottom.current?.scrollIntoView?.({ block: 'end' });
    markRead();
  }, [lastId, markRead]);

  const send = () => {
    const text = content.trim();
    if (!text || actions.send.isPending) return;
    actions.send.mutate(text, {
      onSuccess: () => setContent(''),
      onError: (error) => toast.error(getErrorMessage(error)),
    });
    if (typingSent.current) {
      socket?.emit('typing:stop', { conversationId });
      typingSent.current = false;
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  };

  if (conversation.isError) {
    return <ErrorState error={conversation.error} onRetry={() => conversation.refetch()} />;
  }

  const data = conversation.data;
  const group = data?.type === 'GROUP';
  const other = data?.members.find((member) => member.userId !== meId)?.user;
  const title = group ? (data?.title ?? 'Группа') : (other?.username ?? 'Беседа');
  const typingNames = typing.map((id) => names.get(id)).filter(Boolean);

  return (
    <section
      className="flex min-h-[60vh] min-w-0 flex-col rounded-xl bg-surface shadow-sm"
      aria-label={`Беседа: ${title}`}
      data-testid="conversation-view"
    >
      <header className="flex items-center gap-3 border-b border-border-subtle px-4 py-3">
        <IconButton asChild size="sm" aria-label="К списку бесед" className="lg:hidden">
          <Link href="/messages">
            <ArrowLeft />
          </Link>
        </IconButton>
        <Avatar src={group ? null : (other?.avatar ?? null)} name={title} size="sm" />
        <div className="min-w-0 flex-1">
          {group || !other ? (
            <h2 className="truncate text-sm font-semibold">{title}</h2>
          ) : (
            <Link
              href={`/u/${encodeURIComponent(other.username)}`}
              className="truncate text-sm font-semibold hover:underline"
            >
              {title}
            </Link>
          )}
          {group ? (
            <p className="text-xs text-muted-foreground">Участников: {data?.members.length ?? 0}</p>
          ) : null}
        </div>
        {group ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton size="sm" aria-label="Действия с беседой">
                <MoreHorizontal />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() =>
                  actions.invite.mutate(undefined, {
                    onSuccess: async (invite) => {
                      const url = `${window.location.origin}/messages/invite/${invite.code}`;
                      try {
                        await navigator.clipboard.writeText(url);
                        toast.success('Ссылка-приглашение скопирована', {
                          description: 'Действует для 10 вступлений.',
                        });
                      } catch {
                        toast.info(url);
                      }
                    },
                    onError: (error) => toast.error(getErrorMessage(error)),
                  })
                }
              >
                <Link2 />
                Пригласить по ссылке
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={() => setLeaving(true)}>
                <LogOut />
                Выйти из группы
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
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
          <SkeletonRows rows={4} />
        ) : history.isError ? (
          <ErrorState error={history.error} onRetry={() => history.refetch()} size="sm" />
        ) : messages.length === 0 ? (
          <p className="m-auto text-sm text-muted-foreground">Напишите первое сообщение.</p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="message-list">
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                mine={message.senderId === meId}
                senderName={
                  message.sender?.username ??
                  (message.senderId ? (names.get(message.senderId) ?? 'Игрок') : 'Игрок')
                }
                meId={meId}
                actions={actions}
              />
            ))}
          </ul>
        )}
        <div ref={bottom} />
      </div>
      <p className="min-h-5 px-4 text-xs text-muted-foreground" aria-live="polite">
        {typingNames.length ? `${typingNames.join(', ')} печатает…` : ''}
      </p>
      <form
        className="flex items-end gap-2 border-t border-border-subtle p-3"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <Textarea
          aria-label="Сообщение"
          placeholder="Сообщение…"
          value={content}
          maxLength={CONTENT_MAX}
          rows={1}
          className="max-h-40 min-h-control flex-1"
          onKeyDown={onKeyDown}
          onChange={(event) => {
            setContent(event.target.value);
            if (!typingSent.current && event.target.value) {
              socket?.emit('typing:start', { conversationId });
              typingSent.current = true;
            }
          }}
        />
        <IconButton
          type="submit"
          aria-label="Отправить"
          variant="primary"
          loading={actions.send.isPending}
          disabled={!content.trim()}
        >
          <SendHorizontal />
        </IconButton>
      </form>
      <ConfirmDialog
        open={leaving}
        onOpenChange={setLeaving}
        title="Выйти из группы?"
        description="Вы перестанете получать сообщения этой группы. Вернуться можно по приглашению."
        confirmLabel="Выйти"
        destructive
        onConfirm={async () => {
          await actions.leave.mutateAsync();
          router.replace('/messages');
        }}
      />
    </section>
  );
}
