'use client';

import { SearchX, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ActivityCard } from '@/components/activity/activity-feed';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Avatar } from '@/components/ui/avatar';
import { Button, IconButton } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Textarea } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { ApiError, getErrorMessage } from '@/lib/api/errors';
import { useActivity, useActivityActions, useActivityComments } from '@/lib/activity/hooks';
import { useAuthStore } from '@/lib/auth/store';
import { formatRelative } from '@/lib/format';

/// Запись ленты с комментариями (срез 2.6, ADR-0114). Видимость — как у
/// профиля автора и самой записи; недоступная — «не найдена».
function Comments({ id }: { id: string }) {
  const signedIn = useAuthStore((state) => state.status === 'authenticated');
  const query = useActivityComments(id);
  const { comment, removeComment } = useActivityActions();
  const [content, setContent] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);
  const items = query.data?.pages.flatMap((page) => page.items ?? []) ?? [];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = content.trim();
    if (!text) return;
    comment.mutate(
      { id, content: text },
      {
        onSuccess: () => setContent(''),
        onError: (error) => toast.error(getErrorMessage(error)),
      },
    );
  };

  return (
    <section
      className="flex flex-col gap-3 rounded-xl bg-surface p-4 shadow-sm"
      aria-label="Комментарии"
    >
      <h2 className="text-sm font-semibold">Комментарии</h2>
      {query.isPending ? (
        <SkeletonRows rows={2} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} size="sm" />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Комментариев пока нет.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li key={item.id} className="flex gap-2.5" data-testid="activity-comment">
              <Avatar src={item.author.avatar} name={item.author.username} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <Link
                    href={`/u/${encodeURIComponent(item.author.username)}`}
                    className="truncate text-sm font-medium hover:underline"
                  >
                    {item.author.username}
                  </Link>
                  <span className="text-xs text-subtle-foreground">
                    {formatRelative(item.createdAt)}
                  </span>
                  {item.canDelete ? (
                    <IconButton
                      size="sm"
                      aria-label="Удалить комментарий"
                      className="ml-auto"
                      onClick={() => setRemoving(item.id)}
                    >
                      <Trash2 />
                    </IconButton>
                  ) : null}
                </div>
                <p className="whitespace-pre-wrap break-words text-sm">{item.content}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {signedIn ? (
        <form className="flex flex-col gap-2" onSubmit={submit}>
          <Textarea
            aria-label="Новый комментарий"
            placeholder="Напишите комментарий…"
            value={content}
            maxLength={2000}
            rows={2}
            onChange={(event) => setContent(event.target.value)}
          />
          <Button
            size="sm"
            type="submit"
            className="self-end"
            loading={comment.isPending}
            disabled={!content.trim()}
          >
            Отправить
          </Button>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">
          <Link href="/login" className="font-medium text-primary-soft-foreground hover:underline">
            Войдите
          </Link>
          , чтобы комментировать.
        </p>
      )}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Удалить комментарий?"
        description="Комментарий исчезнет из записи."
        confirmLabel="Удалить"
        destructive
        onConfirm={async () => {
          if (removing) await removeComment.mutateAsync(removing);
        }}
      />
    </section>
  );
}

export default function ActivityPage() {
  const { id } = useParams<{ id: string }>();
  const activity = useActivity(id);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-3 py-6 md:px-6">
      {activity.isPending ? (
        <SkeletonRows rows={3} />
      ) : activity.isError ? (
        activity.error instanceof ApiError && activity.error.status === 404 ? (
          <EmptyState
            icon={<SearchX />}
            title="Запись не найдена"
            description="Её удалили или автор ограничил доступ."
          />
        ) : (
          <ErrorState error={activity.error} onRetry={() => activity.refetch()} />
        )
      ) : (
        <>
          <section className="rounded-xl bg-surface py-2 shadow-sm" data-testid="activity-details">
            <ActivityCard activity={activity.data} linkToDetails={false} />
          </section>
          <Comments id={id} />
        </>
      )}
    </div>
  );
}
