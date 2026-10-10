'use client';

import type { ConversationSummaryDto, MessageUserDto } from '@twomc/shared';
import { MessageSquare, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { getErrorMessage } from '@/lib/api/errors';
import { useAuthStore } from '@/lib/auth/store';
import { cn } from '@/lib/cn';
import { formatBadgeCount } from '@/lib/site/document-badge';
import { formatRelative } from '@/lib/format';
import { useConversations, useStartConversation } from '@/lib/messages/hooks';

/// Название беседы: группа — её заголовок, личная — ник собеседника.
export function conversationTitle(
  conversation: { type: string; title: string | null; members: MessageUserDto[] },
  meId: string | null,
): string {
  if (conversation.type === 'GROUP') return conversation.title ?? 'Группа';
  const other = conversation.members.find((member) => member.id !== meId);
  return other?.username ?? 'Беседа';
}

function preview(item: ConversationSummaryDto, meId: string | null): string {
  const last = item.lastMessage;
  if (!last) return 'Сообщений пока нет';
  if (last.isDeleted) return 'Сообщение удалено';
  const mine = last.senderId === meId ? 'Вы: ' : '';
  return `${mine}${last.content}`;
}

function NewGroupDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { group } = useStartConversation();
  const [title, setTitle] = useState('');
  const [members, setMembers] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const names = members
      .split(/[\s,]+/)
      .map((name) => name.trim())
      .filter(Boolean);
    if (!title.trim() || names.length === 0) {
      setError('Укажите название и хотя бы одного участника.');
      return;
    }
    setError(null);
    group.mutate(
      { title: title.trim(), memberUsernames: names },
      {
        onSuccess: (conversation) => {
          onOpenChange(false);
          router.push(`/messages/${conversation.id}`);
        },
        onError: (failure) => setError(getErrorMessage(failure)),
      },
    );
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" data-testid="new-group-dialog">
        <form className="contents" onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Новая группа</DialogTitle>
            <DialogDescription>
              Добавить можно тех, кто принимает от вас личные сообщения.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <Field label="Название" required>
              <Input
                value={title}
                maxLength={80}
                onChange={(event) => setTitle(event.target.value)}
              />
            </Field>
            <Field label="Участники" hint="Ники через запятую или пробел" required error={error}>
              <Input
                value={members}
                spellCheck={false}
                onChange={(event) => setMembers(event.target.value)}
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" loading={group.isPending}>
              Создать
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ConversationList({ activeId }: { activeId?: string }) {
  const meId = useAuthStore((state) => state.user?.id ?? null);
  const query = useConversations();
  const [creating, setCreating] = useState(false);

  return (
    <section
      className="flex min-w-0 flex-col gap-3"
      aria-label="Беседы"
      data-testid="conversation-list"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Беседы</h2>
        <Button size="sm" variant="secondary" onClick={() => setCreating(true)}>
          <Users />
          Новая группа
        </Button>
      </div>
      {query.isPending ? (
        <SkeletonRows rows={4} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} size="sm" />
      ) : query.data.length === 0 ? (
        <EmptyState
          icon={<MessageSquare />}
          title="Бесед пока нет"
          description="Откройте профиль игрока и нажмите «Написать» или создайте группу."
          className="min-h-0 py-8"
        />
      ) : (
        <ul className="flex flex-col gap-1">
          {query.data.map((item) => {
            const title = conversationTitle(item, meId);
            const other = item.members.find((member) => member.id !== meId);
            return (
              <li key={item.id}>
                <Link
                  href={`/messages/${item.id}`}
                  aria-current={item.id === activeId ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted',
                    item.id === activeId && 'bg-primary-soft hover:bg-primary-soft',
                  )}
                  data-testid="conversation-item"
                >
                  <Avatar
                    src={item.type === 'GROUP' ? item.avatar : (other?.avatar ?? null)}
                    name={title}
                    size="md"
                  />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{title}</span>
                      {item.lastMessageAt ? (
                        <span className="ml-auto shrink-0 text-xs text-subtle-foreground">
                          {formatRelative(item.lastMessageAt)}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="truncate text-xs text-muted-foreground">
                        {preview(item, meId)}
                      </span>
                      {item.unreadCount > 0 ? (
                        <span
                          className="ml-auto shrink-0 rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-5 text-primary-foreground tabular-nums"
                          aria-label={`непрочитанных: ${item.unreadCount}`}
                        >
                          {formatBadgeCount(item.unreadCount)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <NewGroupDialog open={creating} onOpenChange={setCreating} />
    </section>
  );
}
