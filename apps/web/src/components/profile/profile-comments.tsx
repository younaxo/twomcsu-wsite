'use client';

import type { CommentReactionKey, CommentReportReason, ProfileCommentDto } from '@twomc/shared';
import { COMMENT_REACTIONS, COMMENT_REPORT_REASONS } from '@twomc/shared';
import {
  Flag,
  Flame,
  Heart,
  Laugh,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Sparkles,
  ThumbsUp,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Avatar } from '@/components/ui/avatar';
import { Button, IconButton } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/input';
import { RadioField, RadioGroup } from '@/components/ui/radio-group';
import { SkeletonRows } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { Tooltip } from '@/components/ui/tooltip';
import { UserIdentity } from '@/components/ui/user-identity';
import { getErrorMessage } from '@/lib/api/errors';
import { cn } from '@/lib/cn';
import { formatDateTime, formatNumber, formatRelative } from '@/lib/format';
import { useCommentActions, useProfileComments } from '@/lib/profile/comments';

/// Комментарии на профиле (срез 2.3, ADR-0111). Видимость — как у профиля;
/// писать — по политике владельца (вошедшим, без блокировки); реакции — набор
/// иконок (lucide, без emoji — ADR-0085); удалить — автор и владелец профиля,
/// оба через подтверждение; жалоба — окно с причиной. Текст — простой, без HTML.

const CONTENT_MAX = 2000;

const REACTIONS: Record<CommentReactionKey, { icon: LucideIcon; label: string }> = {
  like: { icon: ThumbsUp, label: 'Нравится' },
  heart: { icon: Heart, label: 'Сердце' },
  laugh: { icon: Laugh, label: 'Смешно' },
  fire: { icon: Flame, label: 'Огонь' },
  wow: { icon: Sparkles, label: 'Впечатляет' },
};

const REPORT_REASONS: Record<CommentReportReason, string> = {
  SPAM: 'Спам или реклама',
  INAPPROPRIATE: 'Недопустимый контент',
  HARASSMENT: 'Оскорбления или травля',
  IMPERSONATION: 'Выдаёт себя за другого',
  OTHER: 'Другое',
};

function Reactions({
  comment,
  signedIn,
  onReact,
}: {
  comment: ProfileCommentDto;
  signedIn: boolean;
  onReact: (key: CommentReactionKey) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1" data-testid="comment-reactions">
      {COMMENT_REACTIONS.map((key) => {
        const { icon: Icon, label } = REACTIONS[key];
        const count = comment.reactions.find((item) => item.key === key)?.count ?? 0;
        const active = comment.myReaction === key;
        if (!signedIn && count === 0) return null;
        return (
          <Tooltip key={key} content={signedIn ? label : 'Войдите, чтобы отреагировать'}>
            <button
              type="button"
              aria-label={`${label}${count ? `: ${count}` : ''}`}
              aria-pressed={active}
              aria-disabled={!signedIn || undefined}
              onClick={() => signedIn && onReact(key)}
              className={cn(
                'inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs tabular-nums transition-colors',
                active
                  ? 'bg-primary-soft text-primary-soft-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                !signedIn && 'cursor-default hover:bg-transparent',
              )}
            >
              <Icon aria-hidden className="size-3.5" />
              {count ? formatNumber(count) : null}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}

function ReportCommentDialog({
  open,
  onOpenChange,
  onSubmit,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (reason: CommentReportReason, description: string) => void;
  pending: boolean;
}) {
  const [reason, setReason] = useState<CommentReportReason | null>(null);
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!reason) {
      setError('Выберите причину жалобы.');
      return;
    }
    if (reason === 'OTHER' && !description.trim()) {
      setError('Опишите проблему.');
      return;
    }
    setError(null);
    onSubmit(reason, description.trim());
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setReason(null);
          setDescription('');
          setError(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent size="sm" data-testid="comment-report-dialog">
        <form onSubmit={submit} noValidate className="contents">
          <DialogHeader>
            <DialogTitle>Пожаловаться на комментарий</DialogTitle>
            <DialogDescription>Жалобу увидят только модераторы twomc.su.</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-3">
            <RadioGroup
              aria-label="Причина жалобы"
              value={reason ?? ''}
              onValueChange={(value) => {
                setReason(value as CommentReportReason);
                setError(null);
              }}
              className="gap-0"
            >
              {COMMENT_REPORT_REASONS.map((key) => (
                <RadioField key={key} value={key} label={REPORT_REASONS[key]} />
              ))}
            </RadioGroup>
            <Field
              label="Подробности"
              hint="Необязательно, кроме «Другое». До 500 символов."
              error={error}
            >
              <Textarea
                value={description}
                maxLength={500}
                rows={2}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" loading={pending}>
              <Flag />
              Отправить жалобу
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CommentItem({
  comment,
  signedIn,
  actions,
}: {
  comment: ProfileCommentDto;
  signedIn: boolean;
  actions: ReturnType<typeof useCommentActions>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.content);
  const [confirm, setConfirm] = useState(false);
  const [reporting, setReporting] = useState(false);
  const canReport = signedIn && !comment.canEdit;
  const hasMenu = comment.canEdit || comment.canDelete || canReport;

  return (
    <li id={`comment-${comment.id}`} className="flex gap-3 px-4 py-3" data-testid="profile-comment">
      <Avatar src={comment.author.avatar} name={comment.author.username} size="sm" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <UserIdentity
            username={comment.author.username}
            tag={comment.author.tag}
            previewable
            className="min-w-0"
          />
          <Tooltip content={formatDateTime(comment.createdAt)}>
            <time dateTime={comment.createdAt} className="shrink-0 text-xs text-subtle-foreground">
              {formatRelative(comment.createdAt)}
            </time>
          </Tooltip>
          {comment.isEdited ? (
            <span className="shrink-0 text-xs text-subtle-foreground">изменено</span>
          ) : null}
          {hasMenu ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton size="sm" aria-label="Действия с комментарием" className="ml-auto">
                  <MoreHorizontal />
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {comment.canEdit ? (
                  <DropdownMenuItem
                    onSelect={() => {
                      setDraft(comment.content);
                      setEditing(true);
                    }}
                  >
                    <Pencil />
                    Изменить
                  </DropdownMenuItem>
                ) : null}
                {canReport ? (
                  <DropdownMenuItem onSelect={() => setReporting(true)}>
                    <Flag />
                    Пожаловаться
                  </DropdownMenuItem>
                ) : null}
                {comment.canDelete ? (
                  <DropdownMenuItem variant="destructive" onSelect={() => setConfirm(true)}>
                    <Trash2 />
                    Удалить
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
        {editing ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const content = draft.trim();
              if (!content) return;
              actions.update.mutate(
                { id: comment.id, content },
                {
                  onSuccess: () => setEditing(false),
                  onError: (error) => toast.error(getErrorMessage(error)),
                },
              );
            }}
          >
            <Textarea
              aria-label="Текст комментария"
              value={draft}
              maxLength={CONTENT_MAX}
              rows={3}
              onChange={(event) => setDraft(event.target.value)}
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                type="submit"
                loading={actions.update.isPending}
                disabled={!draft.trim()}
              >
                Сохранить
              </Button>
              <Button size="sm" type="button" variant="ghost" onClick={() => setEditing(false)}>
                Отмена
              </Button>
            </div>
          </form>
        ) : (
          <p className="whitespace-pre-wrap break-words text-sm" data-testid="comment-content">
            {comment.content}
          </p>
        )}
        <Reactions
          comment={comment}
          signedIn={signedIn}
          onReact={(key) =>
            actions.react.mutate(
              { id: comment.id, key },
              { onError: (error) => toast.error(getErrorMessage(error)) },
            )
          }
        />
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Удалить комментарий?"
        description="Комментарий исчезнет из профиля. Отменить удаление нельзя."
        confirmLabel="Удалить"
        destructive
        onConfirm={async () => {
          try {
            await actions.remove.mutateAsync(comment.id);
            toast.success('Комментарий удалён');
          } catch (error) {
            toast.error(getErrorMessage(error));
            throw error;
          }
        }}
      />
      <ReportCommentDialog
        open={reporting}
        onOpenChange={setReporting}
        pending={actions.report.isPending}
        onSubmit={(reason, description) =>
          actions.report.mutate(
            { id: comment.id, reason, description },
            {
              onSuccess: () => {
                setReporting(false);
                toast.success('Жалоба отправлена', {
                  description: 'Модераторы рассмотрят её в ближайшее время.',
                });
              },
              onError: (error) => toast.error(getErrorMessage(error)),
            },
          )
        }
      />
    </li>
  );
}

export function ProfileComments({ username, signedIn }: { username: string; signedIn: boolean }) {
  const query = useProfileComments(username);
  const actions = useCommentActions(username);
  const [content, setContent] = useState('');
  const first = query.data?.pages[0];
  const items = query.data?.pages.flatMap((page) => page.items ?? []) ?? [];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = content.trim();
    if (!text) return;
    actions.create.mutate(text, {
      onSuccess: () => setContent(''),
      onError: (error) => toast.error(getErrorMessage(error)),
    });
  };

  return (
    <section
      className="flex flex-col gap-3 rounded-xl bg-surface p-5 shadow-sm"
      aria-label="Комментарии"
      data-testid="profile-comments"
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <MessageSquare aria-hidden className="size-4 text-muted-foreground" />
        Комментарии
        {first?.total ? (
          <span className="text-muted-foreground tabular-nums">{formatNumber(first.total)}</span>
        ) : null}
      </h2>
      {query.isPending ? (
        <SkeletonRows rows={3} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} size="sm" />
      ) : (
        <>
          {!first?.commentsEnabled ? (
            <p className="text-sm text-muted-foreground" data-testid="comments-disabled">
              Комментарии в этом профиле отключены.
            </p>
          ) : first.canComment ? (
            <form className="flex flex-col gap-2" onSubmit={submit} data-testid="comment-form">
              <Textarea
                aria-label="Новый комментарий"
                placeholder="Напишите комментарий…"
                value={content}
                maxLength={CONTENT_MAX}
                rows={2}
                onChange={(event) => setContent(event.target.value)}
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs tabular-nums text-subtle-foreground">
                  {content.length}/{CONTENT_MAX}
                </span>
                <Button
                  size="sm"
                  type="submit"
                  loading={actions.create.isPending}
                  disabled={!content.trim()}
                >
                  Отправить
                </Button>
              </div>
            </form>
          ) : signedIn ? (
            <p className="text-sm text-muted-foreground" data-testid="comments-restricted">
              Владелец профиля ограничил, кто может оставлять комментарии.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground" data-testid="comments-sign-in">
              <Link
                href="/login"
                className="font-medium text-primary-soft-foreground hover:underline"
              >
                Войдите
              </Link>
              , чтобы оставить комментарий.
            </p>
          )}
          {items.length === 0 ? (
            <EmptyState
              icon={<MessageSquare />}
              title="Комментариев пока нет"
              description="Здесь появятся комментарии игроков."
              className="min-h-0 py-6"
            />
          ) : (
            <ul className="-mx-4 flex flex-col divide-y divide-border-subtle">
              {items.map((comment) => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  signedIn={signedIn}
                  actions={actions}
                />
              ))}
            </ul>
          )}
          {query.hasNextPage ? (
            <Button
              variant="secondary"
              size="sm"
              loading={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              Показать ещё
            </Button>
          ) : null}
        </>
      )}
    </section>
  );
}
