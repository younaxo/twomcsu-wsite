'use client';

import { MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { PermissionGate } from '@/components/admin/permission-gate';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { SkeletonRows } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
import {
  MUTE_REASON_LABEL,
  useChatBans,
  useChatModerationActions,
  useChatMutes,
  useChatSearch,
  type ChatModUser,
} from '@/lib/admin/chat';
import { getErrorMessage } from '@/lib/api/errors';
import { usePermissions } from '@/lib/auth/use-permissions';
import { formatDateTime } from '@/lib/format';

/// Модерация чата (срез 7.7, ADR-0134): действующие муты и баны со снятием,
/// поиск сообщений. Вкладки и кнопки — по правам `chat.*`.

const onError = (error: unknown) => toast.error(getErrorMessage(error));

function Who({ user }: { user: ChatModUser | null }) {
  return user ? (
    <Link href={`/u/${encodeURIComponent(user.username)}`} className="font-medium hover:underline">
      {user.username}
    </Link>
  ) : (
    <span>—</span>
  );
}

const until = (value: string | null) => (value ? `до ${formatDateTime(value)}` : 'бессрочно');

function Mutes() {
  const { can } = usePermissions();
  const mutes = useChatMutes(true);
  const { unmute } = useChatModerationActions();
  if (mutes.isPending) return <SkeletonRows rows={4} />;
  if (mutes.isError) return <ErrorState error={mutes.error} onRetry={() => mutes.refetch()} />;
  if (mutes.data.length === 0) return <EmptyState title="Действующих мутов нет" />;
  return (
    <ul
      className="flex flex-col divide-y divide-border-subtle rounded-xl bg-surface shadow-sm"
      data-testid="chat-mutes"
    >
      {mutes.data.map((mute) => (
        <li key={mute.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
          <Who user={mute.user} />
          <Badge tone="warning">{MUTE_REASON_LABEL[mute.reason] ?? mute.reason}</Badge>
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {until(mute.mutedUntil)}
            {mute.reasonNote ? ` · ${mute.reasonNote}` : ''}
          </span>
          {can('chat.mutes.delete') ? (
            <Button
              size="sm"
              variant="secondary"
              loading={unmute.isPending && unmute.variables === mute.id}
              onClick={() => unmute.mutate(mute.id, { onError })}
            >
              Снять мут
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function Bans() {
  const { can } = usePermissions();
  const bans = useChatBans(true);
  const { unban } = useChatModerationActions();
  if (bans.isPending) return <SkeletonRows rows={4} />;
  if (bans.isError) return <ErrorState error={bans.error} onRetry={() => bans.refetch()} />;
  if (bans.data.length === 0) return <EmptyState title="Действующих банов нет" />;
  return (
    <ul
      className="flex flex-col divide-y divide-border-subtle rounded-xl bg-surface shadow-sm"
      data-testid="chat-bans"
    >
      {bans.data.map((ban) => (
        <li key={ban.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
          <Who user={ban.user} />
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {until(ban.bannedUntil)} · {ban.reason}
          </span>
          {can('chat.bans.delete') ? (
            <Button
              size="sm"
              variant="secondary"
              loading={unban.isPending && unban.variables === ban.id}
              onClick={() => unban.mutate(ban.id, { onError })}
            >
              Снять бан
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function Search() {
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState({ q: '', page: 1 });
  const results = useChatSearch(query.q, query.page);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const q = draft.trim();
    if (q) setQuery({ q, page: 1 });
  };
  const totalPages = results.data
    ? Math.max(1, Math.ceil(results.data.total / results.data.limit))
    : 1;
  return (
    <div className="flex flex-col gap-3">
      <form className="flex gap-2" onSubmit={submit}>
        <Input
          aria-label="Текст сообщения"
          placeholder="Найти в сообщениях…"
          value={draft}
          maxLength={200}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button type="submit" disabled={!draft.trim()}>
          Найти
        </Button>
      </form>
      {!query.q ? null : results.isPending ? (
        <SkeletonRows rows={4} />
      ) : results.isError ? (
        <ErrorState error={results.error} onRetry={() => results.refetch()} />
      ) : results.data.items.length === 0 ? (
        <EmptyState icon={<MessageSquare />} title="Ничего не найдено" />
      ) : (
        <>
          <ul
            className="flex flex-col divide-y divide-border-subtle rounded-xl bg-surface shadow-sm"
            data-testid="chat-search"
          >
            {results.data.items.map((message) => (
              <li key={message.id} className="flex flex-col gap-0.5 px-4 py-3 text-sm">
                <span className="text-xs text-muted-foreground">
                  <Who user={message.author} /> · {message.channel?.name ?? '—'} ·{' '}
                  {formatDateTime(message.createdAt)}
                  {message.isDeleted ? ' · удалено' : ''}
                </span>
                <span className="whitespace-pre-wrap break-words">{message.content}</span>
              </li>
            ))}
          </ul>
          {totalPages > 1 ? (
            <Pagination
              page={query.page}
              totalPages={totalPages}
              onPageChange={(page) => setQuery({ ...query, page })}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

function ChatModeration() {
  const { can } = usePermissions();
  const tabs = [
    can('chat.mutes.view') && { value: 'mutes', label: 'Муты', content: <Mutes /> },
    can('chat.bans.view') && { value: 'bans', label: 'Баны', content: <Bans /> },
    can('chat.messages.search.view') && {
      value: 'search',
      label: 'Поиск сообщений',
      content: <Search />,
    },
  ].filter(Boolean) as Array<{ value: string; label: string; content: JSX.Element }>;
  return (
    <Tabs defaultValue={tabs[0]?.value}>
      <TabsList>
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value} className="pt-4">
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}

export default function AdminChatPage() {
  return (
    <PermissionGate
      requirement={['chat.mutes.view', 'chat.bans.view', 'chat.messages.search.view']}
    >
      <PageHeader title="Чат" description="Муты, баны и поиск по сообщениям общего чата." />
      <ChatModeration />
    </PermissionGate>
  );
}
