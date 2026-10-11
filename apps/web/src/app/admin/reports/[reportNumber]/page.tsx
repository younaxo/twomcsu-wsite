'use client';

import { ArrowLeft, LifeBuoy, Lock, Pin } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { PermissionGate } from '@/components/admin/permission-gate';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Input, Textarea, inputClassName } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import {
  STAFF_REPORT_TYPE_LABEL,
  useStaffReport,
  useStaffReportActions,
  type StaffReportDetails,
} from '@/lib/admin/reports';
import { ApiError, getErrorMessage } from '@/lib/api/errors';
import { useAuthStore } from '@/lib/auth/store';
import { usePermissions } from '@/lib/auth/use-permissions';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';
import { REPORT_STATUS_LABEL, type ReportStatus } from '@/lib/support/hooks';

/// Карточка обращения для персонала (срез 7.3, ADR-0128): описание, цели,
/// переписка с ответом, заметки персонала, назначение, статус, вердикт,
/// блокировка. Каждое действие — по своему праву `reports.*`.

const onError = (error: unknown) => toast.error(getErrorMessage(error));

function Composer({
  label,
  submitLabel,
  pending,
  onSubmit,
}: {
  label: string;
  submitLabel: string;
  pending: boolean;
  onSubmit: (text: string, done: () => void) => void;
}) {
  const [text, setText] = useState('');
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        if (text.trim()) onSubmit(text.trim(), () => setText(''));
      }}
    >
      <Textarea
        aria-label={label}
        value={text}
        rows={3}
        onChange={(event) => setText(event.target.value)}
      />
      <Button
        size="sm"
        type="submit"
        className="self-end"
        loading={pending}
        disabled={!text.trim()}
      >
        {submitLabel}
      </Button>
    </form>
  );
}

function Actions({ report }: { report: StaffReportDetails }) {
  const { can } = usePermissions();
  const meId = useAuthStore((state) => state.user?.id ?? null);
  const actions = useStaffReportActions(report.reportNumber);
  const [verdict, setVerdict] = useState(report.verdict ?? '');
  const [lockReason, setLockReason] = useState('');
  const [banReason, setBanReason] = useState('');
  return (
    <aside
      className="flex flex-col gap-4 rounded-xl bg-surface p-4 shadow-sm"
      data-testid="report-actions"
    >
      {can('reports.assign') ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-muted-foreground">
            Исполнитель: {report.assignedTo?.username ?? 'не назначен'}
          </p>
          <Button
            size="sm"
            variant="secondary"
            loading={actions.assign.isPending}
            onClick={() =>
              actions.assign.mutate(report.assignedToId === meId ? null : meId, { onError })
            }
          >
            {report.assignedToId === meId ? 'Снять с себя' : 'Взять себе'}
          </Button>
        </div>
      ) : null}
      {can('reports.status') ? (
        <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          Статус
          <select
            className={inputClassName}
            value={report.status}
            onChange={(event) =>
              actions.status.mutate(event.target.value as ReportStatus, { onError })
            }
          >
            {(Object.keys(REPORT_STATUS_LABEL) as ReportStatus[]).map((status) => (
              <option key={status} value={status}>
                {REPORT_STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {can('reports.verdict') ? (
        <form
          className="flex flex-col gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!verdict.trim()) return;
            actions.verdict.mutate(
              { verdict: verdict.trim() },
              { onSuccess: () => toast.success('Решение сохранено'), onError },
            );
          }}
        >
          <Textarea
            aria-label="Решение"
            placeholder="Решение — его увидит автор"
            value={verdict}
            rows={3}
            onChange={(event) => setVerdict(event.target.value)}
          />
          <Button
            size="sm"
            type="submit"
            loading={actions.verdict.isPending}
            disabled={!verdict.trim()}
          >
            Сохранить решение
          </Button>
        </form>
      ) : null}
      {can('reports.lock') ? (
        report.isLocked ? (
          <Button
            size="sm"
            variant="secondary"
            loading={actions.lock.isPending}
            onClick={() => actions.lock.mutate({ locked: false }, { onError })}
          >
            Разблокировать ответы
          </Button>
        ) : (
          <div className="flex flex-col gap-1.5">
            <Input
              aria-label="Причина блокировки"
              placeholder="Причина (необязательно)"
              value={lockReason}
              onChange={(event) => setLockReason(event.target.value)}
            />
            <Button
              size="sm"
              variant="secondary"
              loading={actions.lock.isPending}
              onClick={() =>
                actions.lock.mutate(
                  { locked: true, ...(lockReason.trim() ? { reason: lockReason.trim() } : {}) },
                  { onError },
                )
              }
            >
              Заблокировать ответы автора
            </Button>
          </div>
        )
      ) : null}
      {can(report.isArchived ? 'reports.unarchive' : 'reports.archive') ? (
        <Button
          size="sm"
          variant="secondary"
          loading={actions.archive.isPending}
          onClick={() =>
            actions.archive.mutate(!report.isArchived, {
              onSuccess: () =>
                toast.success(report.isArchived ? 'Возвращено из архива' : 'Перенесено в архив'),
              onError,
            })
          }
        >
          {report.isArchived ? 'Вернуть из архива' : 'В архив'}
        </Button>
      ) : null}
      {can('reports.ban') ? (
        <div className="flex flex-col gap-1.5">
          <Input
            aria-label="Причина запрета обращений"
            placeholder="Причина запрета (обязательно)"
            value={banReason}
            onChange={(event) => setBanReason(event.target.value)}
          />
          <Button
            size="sm"
            variant="ghost"
            disabled={!banReason.trim()}
            loading={actions.banAuthor.isPending}
            onClick={() =>
              actions.banAuthor.mutate(
                { userId: report.authorId, reason: banReason.trim() },
                {
                  onSuccess: () => {
                    setBanReason('');
                    toast.success('Автору запрещены новые обращения');
                  },
                  onError,
                },
              )
            }
          >
            Запретить автору обращения
          </Button>
        </div>
      ) : null}
    </aside>
  );
}

function Card({ number }: { number: string }) {
  const { can } = usePermissions();
  const report = useStaffReport(number);
  const actions = useStaffReportActions(number);
  if (report.isPending) return <SkeletonRows rows={6} />;
  if (report.isError) {
    return report.error instanceof ApiError && report.error.status === 404 ? (
      <EmptyState icon={<LifeBuoy />} title="Обращение не найдено" />
    ) : (
      <ErrorState error={report.error} onRetry={() => report.refetch()} />
    );
  }
  const data = report.data;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <div className="flex flex-col gap-4">
        <section
          className="flex flex-col gap-2 rounded-xl bg-surface p-5 shadow-sm"
          data-testid="staff-report"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">#{data.reportNumber}</span>
            <span className="text-sm font-medium">
              {STAFF_REPORT_TYPE_LABEL[data.type] ?? data.type}
            </span>
            <Badge tone="neutral">{REPORT_STATUS_LABEL[data.status]}</Badge>
            {data.isLocked ? (
              <Badge tone="warning" icon={<Lock aria-hidden />}>
                Ответы закрыты
              </Badge>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Автор:{' '}
            {data.author ? (
              <Link
                href={`/u/${encodeURIComponent(data.author.username)}`}
                className="font-medium hover:underline"
              >
                {data.author.username}
              </Link>
            ) : (
              '—'
            )}{' '}
            · {formatDateTime(data.createdAt)}
            {data.server ? ` · сервер: ${data.server}` : ''}
          </p>
          {data.targets.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Нарушители: {data.targets.map((target) => target.username ?? '—').join(', ')}
            </p>
          ) : null}
          <p className="whitespace-pre-wrap break-words text-sm">{data.description}</p>
        </section>
        <section
          className="flex flex-col gap-3 rounded-xl bg-surface p-5 shadow-sm"
          aria-label="Переписка"
        >
          <h2 className="text-sm font-semibold">Переписка</h2>
          {data.messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">Сообщений пока нет.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.messages.map((message) => (
                <li
                  key={message.id}
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm',
                    message.isStaff ? 'bg-primary-soft' : 'bg-surface-sunken',
                  )}
                >
                  <p className="text-xs text-muted-foreground">
                    {message.isSystem ? 'Система' : message.isStaff ? 'Персонал' : 'Автор'} ·{' '}
                    {formatDateTime(message.createdAt)}
                    {message.isPinned ? (
                      <Pin aria-label="Закреплено" className="ml-1 inline size-3" />
                    ) : null}
                  </p>
                  <p
                    className={cn(
                      'whitespace-pre-wrap break-words',
                      message.isDeleted && 'italic text-muted-foreground',
                    )}
                  >
                    {message.isDeleted ? `Удалено: ${message.content}` : message.content}
                  </p>
                  {!message.isDeleted && !message.isSystem ? (
                    <div className="mt-1 flex gap-1">
                      {can(message.isPinned ? 'reports.messages.unpin' : 'reports.messages.pin') ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            actions.pinMessage.mutate(
                              { messageId: message.id, pinned: !message.isPinned },
                              { onError },
                            )
                          }
                        >
                          {message.isPinned ? 'Открепить' : 'Закрепить'}
                        </Button>
                      ) : null}
                      {can('reports.messages') ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => actions.hideMessage.mutate(message.id, { onError })}
                        >
                          Скрыть
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {can('reports.messages') ? (
            <Composer
              label="Ответ автору"
              submitLabel="Ответить"
              pending={actions.message.isPending}
              onSubmit={(text, done) => actions.message.mutate(text, { onSuccess: done, onError })}
            />
          ) : null}
        </section>
        {can('reports.notes') ? (
          <section
            className="flex flex-col gap-3 rounded-xl bg-surface p-5 shadow-sm"
            aria-label="Заметки персонала"
          >
            <h2 className="text-sm font-semibold">Заметки персонала</h2>
            <p className="text-xs text-muted-foreground">Автор обращения их не видит.</p>
            {data.moderatorNotes.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {data.moderatorNotes.map((note) => (
                  <li key={note.id} className="rounded-lg bg-surface-sunken px-3 py-2 text-sm">
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(note.createdAt)}
                    </p>
                    <p className="whitespace-pre-wrap break-words">{note.content}</p>
                  </li>
                ))}
              </ul>
            ) : null}
            <Composer
              label="Новая заметка"
              submitLabel="Добавить заметку"
              pending={actions.note.isPending}
              onSubmit={(text, done) => actions.note.mutate(text, { onSuccess: done, onError })}
            />
          </section>
        ) : null}
      </div>
      <Actions report={data} />
    </div>
  );
}

export default function AdminReportPage() {
  const { reportNumber } = useParams<{ reportNumber: string }>();
  return (
    <PermissionGate requirement="reports.view">
      <PageHeader
        title="Обращение"
        actions={
          <Button asChild size="sm" variant="ghost">
            <Link href="/admin/reports">
              <ArrowLeft />
              Очередь
            </Link>
          </Button>
        }
      />
      <Card number={reportNumber} />
    </PermissionGate>
  );
}
