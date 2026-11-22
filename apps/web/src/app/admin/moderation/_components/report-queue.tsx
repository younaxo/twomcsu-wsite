'use client';

import { Flag } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { PermissionGate } from '@/components/admin/permission-gate';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState, ForbiddenState } from '@/components/ui/error-state';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { SkeletonRows } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import {
  CONTENT_REPORT_REASON_LABEL,
  CONTENT_REPORT_STATUS_LABEL,
  useContentReports,
  useHardDeleteComment,
  useReviewContentReport,
  type ContentReportKind,
  type ContentReportRow,
  type ContentReportStatus,
} from '@/lib/admin/content-reports';
import { ApiError, getErrorMessage } from '@/lib/api/errors';
import { usePermissions } from '@/lib/auth/use-permissions';
import { formatDateTime } from '@/lib/format';

/// Очередь жалоб на комментарии или профили (`comment_reports.*`,
/// `profile_reports.*`). Принять/отклонить — по праву `*.edit`; жёсткое
/// удаление комментария — по `comments.hard_delete`, только с подтверждением.

const PAGE_SIZE = 25;
const NOTE_MAX = 1000;

const STATUS_OPTIONS = [
  { value: 'PENDING', label: 'Ожидают' },
  { value: 'RESOLVED', label: 'Приняты' },
  { value: 'REJECTED', label: 'Отклонены' },
  { value: 'ALL', label: 'Все' },
];

const STATUS_TONE = { PENDING: 'warning', RESOLVED: 'success', REJECTED: 'neutral' } as const;

const COPY: Record<
  ContentReportKind,
  {
    title: string;
    description: string;
    view: 'comment_reports.view' | 'profile_reports.view';
    edit: 'comment_reports.edit' | 'profile_reports.edit';
    emptyTitle: string;
  }
> = {
  comment: {
    title: 'Жалобы на комментарии',
    description: 'Жалобы игроков на комментарии в профилях.',
    view: 'comment_reports.view',
    edit: 'comment_reports.edit',
    emptyTitle: 'Жалоб на комментарии нет',
  },
  profile: {
    title: 'Жалобы на профили',
    description: 'Жалобы игроков на оформление и содержимое профилей.',
    view: 'profile_reports.view',
    edit: 'profile_reports.edit',
    emptyTitle: 'Жалоб на профили нет',
  },
};

type Action =
  | { type: 'review'; verdict: 'RESOLVED' | 'REJECTED'; row: ContentReportRow }
  | { type: 'delete'; row: ContentReportRow };

function ReportItem({
  row,
  canEdit,
  canDelete,
  canOpenUser,
  onAction,
}: {
  row: ContentReportRow;
  canEdit: boolean;
  canDelete: boolean;
  canOpenUser: boolean;
  onAction: (action: Action) => void;
}) {
  const pending = row.status === 'PENDING';
  const showDelete = canDelete && row.kind === 'comment' && !row.commentDeleted && row.commentId;
  return (
    <li data-testid="content-report" className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Badge tone={STATUS_TONE[row.status]}>{CONTENT_REPORT_STATUS_LABEL[row.status]}</Badge>
        <Badge tone="outline">{CONTENT_REPORT_REASON_LABEL[row.reason] ?? row.reason}</Badge>
        {row.kind === 'profile' ? (
          canOpenUser && row.profileId ? (
            <Link
              href={`/admin/users/${encodeURIComponent(row.profileId)}`}
              className="text-sm font-medium hover:underline"
            >
              {row.profileName ?? 'Профиль'}
            </Link>
          ) : (
            <span className="text-sm font-medium">{row.profileName ?? 'Профиль'}</span>
          )
        ) : null}
        <span className="text-xs text-subtle-foreground">{formatDateTime(row.createdAt)}</span>
      </div>
      {row.kind === 'comment' ? (
        <blockquote className="whitespace-pre-line break-words rounded-lg bg-surface-sunken px-3 py-2 text-sm">
          {row.commentDeleted ? (
            <span className="text-muted-foreground">Комментарий удалён</span>
          ) : (
            (row.commentText ?? <span className="text-muted-foreground">Текст недоступен</span>)
          )}
        </blockquote>
      ) : null}
      {row.description ? (
        <p className="whitespace-pre-line break-words text-sm text-muted-foreground">
          {row.description}
        </p>
      ) : null}
      {row.reporterName ? (
        <p className="text-xs text-subtle-foreground">Пожаловался: {row.reporterName}</p>
      ) : null}
      {!pending ? (
        <p className="text-xs text-subtle-foreground">
          {row.reviewedAt ? `Рассмотрена ${formatDateTime(row.reviewedAt)}` : 'Рассмотрена'}
          {row.reviewNote ? ` · ${row.reviewNote}` : ''}
        </p>
      ) : null}
      {(canEdit && pending) || showDelete ? (
        <div className="flex flex-wrap gap-2">
          {canEdit && pending ? (
            <>
              <Button
                size="sm"
                onClick={() => onAction({ type: 'review', verdict: 'RESOLVED', row })}
              >
                Принять
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onAction({ type: 'review', verdict: 'REJECTED', row })}
              >
                Отклонить
              </Button>
            </>
          ) : null}
          {showDelete ? (
            <Button size="sm" variant="ghost" onClick={() => onAction({ type: 'delete', row })}>
              Удалить комментарий
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function Queue({ kind }: { kind: ContentReportKind }) {
  const copy = COPY[kind];
  const { can } = usePermissions();
  const [status, setStatus] = useState<ContentReportStatus | 'ALL'>('PENDING');
  const [shown, setShown] = useState(PAGE_SIZE);
  const [action, setAction] = useState<Action | null>(null);
  const [note, setNote] = useState('');
  const query = useContentReports(kind, status);
  const review = useReviewContentReport(kind);
  const hardDelete = useHardDeleteComment();
  const canEdit = can(copy.edit);
  const canDelete = kind === 'comment' && can('comments.hard_delete');
  const canOpenUser = can('users.view');

  const close = () => {
    setAction(null);
    setNote('');
  };

  const confirm = async () => {
    if (!action) return;
    try {
      if (action.type === 'review') {
        await review.mutateAsync({
          id: action.row.id,
          status: action.verdict,
          reviewNote: note,
        });
        toast.success(action.verdict === 'RESOLVED' ? 'Жалоба принята' : 'Жалоба отклонена');
      } else {
        await hardDelete.mutateAsync({ commentId: action.row.commentId!, reason: note });
        toast.success('Комментарий удалён');
      }
      setNote('');
    } catch (error) {
      toast.error(getErrorMessage(error));
      throw error;
    }
  };

  let body;
  if (query.isPending) {
    body = <SkeletonRows rows={5} />;
  } else if (query.isError) {
    body =
      query.error instanceof ApiError && query.error.status === 403 ? (
        <ForbiddenState title="Недостаточно прав" />
      ) : (
        <ErrorState
          error={query.error}
          onRetry={() => query.refetch()}
          retrying={query.isFetching}
        />
      );
  } else if (query.data.length === 0) {
    body = (
      <EmptyState
        icon={<Flag />}
        title={copy.emptyTitle}
        description={status === 'PENDING' ? 'Очередь пуста.' : 'Измените фильтр статуса.'}
      />
    );
  } else {
    body = (
      <div className="flex flex-col gap-3">
        <ul
          className="flex flex-col divide-y divide-border-subtle rounded-xl bg-surface shadow-sm"
          data-testid="content-reports"
        >
          {query.data.slice(0, shown).map((row) => (
            <ReportItem
              key={row.id}
              row={row}
              canEdit={canEdit}
              canDelete={canDelete}
              canOpenUser={canOpenUser}
              onAction={setAction}
            />
          ))}
        </ul>
        {query.data.length > shown ? (
          <div className="flex justify-center">
            <Button variant="secondary" onClick={() => setShown((value) => value + PAGE_SIZE)}>
              Показать ещё
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  const isDelete = action?.type === 'delete';
  const resolving = action?.type === 'review' && action.verdict === 'RESOLVED';
  return (
    <>
      <PageHeader
        title={copy.title}
        breadcrumbs={[{ label: 'Контент' }, { label: copy.title }]}
        description={copy.description}
      />
      <SegmentedControl
        aria-label="Статус жалоб"
        size="sm"
        options={STATUS_OPTIONS}
        value={status}
        onValueChange={(value) => {
          setStatus(value as ContentReportStatus | 'ALL');
          setShown(PAGE_SIZE);
        }}
      />
      {body}
      <ConfirmDialog
        open={action !== null}
        onOpenChange={(open) => !open && close()}
        title={
          isDelete
            ? 'Удалить комментарий навсегда?'
            : resolving
              ? 'Принять жалобу?'
              : 'Отклонить жалобу?'
        }
        description={
          isDelete
            ? 'Комментарий будет удалён без возможности восстановления. Действие необратимо.'
            : 'Решение сохранится в жалобе; заметка видна только персоналу.'
        }
        confirmLabel={isDelete ? 'Удалить навсегда' : resolving ? 'Принять' : 'Отклонить'}
        destructive={isDelete}
        onConfirm={confirm}
      >
        <Field label={isDelete ? 'Причина (необязательно)' : 'Заметка (необязательно)'}>
          <Textarea
            rows={3}
            maxLength={NOTE_MAX}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
      </ConfirmDialog>
    </>
  );
}

export function ReportQueuePage({ kind }: { kind: ContentReportKind }) {
  return (
    <PermissionGate requirement={COPY[kind].view}>
      <Queue kind={kind} />
    </PermissionGate>
  );
}
