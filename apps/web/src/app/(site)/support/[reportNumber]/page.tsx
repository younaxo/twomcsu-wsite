'use client';

import { LifeBuoy, Pencil } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { RequireSession } from '@/components/auth/require-session';
import { Badge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Textarea } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { ApiError, getErrorMessage } from '@/lib/api/errors';
import { useAuthStore } from '@/lib/auth/store';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';
import {
  REPORT_STATUS_LABEL,
  REPORT_TYPES,
  useReport,
  useSupportActions,
  type ReportMessageDto,
  type ReportType,
} from '@/lib/support/hooks';

/// Обращение (срез 3.5, ADR-0120): описание, решение, переписка с
/// администрацией, ответ и правка своего сообщения. Закрытое — без ответа.

const FINAL = new Set(['RESOLVED', 'REJECTED', 'CLOSED']);

function Message({
  number,
  message,
  mine,
}: {
  number: string;
  message: ReportMessageDto;
  mine: boolean;
}) {
  const { edit } = useSupportActions();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  return (
    <li className={cn('flex flex-col gap-1', mine && 'items-end')} data-testid="report-message">
      <span className="text-xs text-muted-foreground">
        {message.isSystem ? 'Система' : message.isStaff ? 'Администрация' : 'Вы'} ·{' '}
        {formatDateTime(message.createdAt)}
      </span>
      {editing ? (
        <form
          className="flex w-full max-w-md flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!draft.trim()) return;
            edit.mutate(
              { number, messageId: message.id, content: draft.trim() },
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
            rows={3}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="flex gap-2 self-end">
            <Button size="sm" variant="ghost" type="button" onClick={() => setEditing(false)}>
              Отмена
            </Button>
            <Button size="sm" type="submit" loading={edit.isPending}>
              Сохранить
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex max-w-md items-start gap-1">
          <p
            className={cn(
              'whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm',
              mine ? 'bg-primary text-primary-foreground' : 'bg-surface-sunken',
            )}
          >
            {message.isDeleted ? 'Сообщение удалено' : message.content}
          </p>
          {mine && !message.isDeleted ? (
            <IconButton size="sm" aria-label="Изменить сообщение" onClick={() => setEditing(true)}>
              <Pencil />
            </IconButton>
          ) : null}
        </div>
      )}
    </li>
  );
}

function ReportView({ number }: { number: string }) {
  const meId = useAuthStore((state) => state.user?.id ?? null);
  const report = useReport(number);
  const { reply } = useSupportActions();
  const [content, setContent] = useState('');
  if (report.isPending) return <SkeletonRows rows={5} />;
  if (report.isError) {
    return report.error instanceof ApiError && [403, 404].includes(report.error.status) ? (
      <EmptyState
        icon={<LifeBuoy />}
        title="Обращение не найдено"
        description="Проверьте номер обращения."
      />
    ) : (
      <ErrorState error={report.error} onRetry={() => report.refetch()} />
    );
  }
  const data = report.data;
  const closed = FINAL.has(data.status);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!content.trim()) return;
    reply.mutate(
      { number, content: content.trim() },
      { onSuccess: () => setContent(''), onError: (error) => toast.error(getErrorMessage(error)) },
    );
  };
  return (
    <div className="flex flex-col gap-4" data-testid="report-view">
      <section className="flex flex-col gap-2 rounded-xl bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">#{data.reportNumber}</span>
          <span className="text-sm font-medium">
            {data.type in REPORT_TYPES ? REPORT_TYPES[data.type as ReportType].label : 'Обращение'}
          </span>
          <Badge tone={data.status === 'WAITING_RESPONSE' ? 'warning' : 'neutral'}>
            {REPORT_STATUS_LABEL[data.status]}
          </Badge>
        </div>
        <p className="whitespace-pre-wrap break-words text-sm">{data.description}</p>
        {data.verdict ? (
          <p className="rounded-lg bg-surface-sunken px-3 py-2 text-sm">
            <span className="font-medium">Решение: </span>
            {data.verdict}
          </p>
        ) : null}
      </section>
      <section
        className="flex flex-col gap-3 rounded-xl bg-surface p-5 shadow-sm"
        aria-label="Переписка"
      >
        {data.messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">Администрация ещё не ответила.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {data.messages.map((message) => (
              <Message
                key={message.id}
                number={number}
                message={message}
                mine={message.authorId === meId && !message.isStaff}
              />
            ))}
          </ul>
        )}
        {closed ? (
          <p className="text-sm text-muted-foreground">Обращение закрыто — ответить нельзя.</p>
        ) : (
          <form className="flex flex-col gap-2" onSubmit={submit}>
            <Textarea
              aria-label="Ответ"
              placeholder="Ваш ответ…"
              value={content}
              rows={3}
              onChange={(event) => setContent(event.target.value)}
            />
            <Button
              size="sm"
              type="submit"
              className="self-end"
              loading={reply.isPending}
              disabled={!content.trim()}
            >
              Ответить
            </Button>
          </form>
        )}
      </section>
    </div>
  );
}

export default function ReportPage() {
  const { reportNumber } = useParams<{ reportNumber: string }>();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-8 md:px-6">
      <PageHeader title="Обращение" description="Переписка с администрацией twomc.su." />
      <RequireSession>
        <ReportView number={reportNumber} />
      </RequireSession>
    </div>
  );
}
