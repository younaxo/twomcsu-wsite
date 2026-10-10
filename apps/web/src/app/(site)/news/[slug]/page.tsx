'use client';

import { Eye, Heart, Link2, Newspaper, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { CATEGORY_LABEL } from '@/app/(site)/_components/news-section';
import { ACTIVITY_REACTION_META } from '@/components/activity/activity-feed';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Textarea } from '@/components/ui/input';
import { SafeMarkdown } from '@/components/ui/safe-markdown';
import { SkeletonRows } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { ApiError, getErrorMessage } from '@/lib/api/errors';
import { useAuthStore } from '@/lib/auth/store';
import { cn } from '@/lib/cn';
import { formatDate, formatNumber, formatRelative } from '@/lib/format';
import {
  useNewsActions,
  useNewsArticle,
  useNewsComments,
  type NewsArticleDto,
} from '@/lib/news/hooks';

/// Статья (срез 3.3, ADR-0117): текст — безопасный Markdown, лайк, «поделиться»
/// (копирование ссылки), комментарии с реакциями (ключи, иконки lucide).

const REACTION_KEYS = ['like', 'heart', 'laugh', 'fire', 'wow'] as const;

function Comments({ article }: { article: NewsArticleDto }) {
  const signedIn = useAuthStore((state) => state.status === 'authenticated');
  const query = useNewsComments(article.slug);
  const actions = useNewsActions(article.slug);
  const [content, setContent] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);
  const items = query.data?.pages.flatMap((page) => page.items ?? []) ?? [];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = content.trim();
    if (!text) return;
    actions.comment.mutate(text, {
      onSuccess: () => setContent(''),
      onError: (error) => toast.error(getErrorMessage(error)),
    });
  };

  return (
    <section
      className="flex flex-col gap-3 rounded-xl bg-surface p-5 shadow-sm"
      aria-label="Комментарии"
    >
      <h2 className="text-sm font-semibold">
        Комментарии {article.commentsCount ? formatNumber(article.commentsCount) : ''}
      </h2>
      {!article.allowComments ? (
        <p className="text-sm text-muted-foreground">Комментарии к этой новости отключены.</p>
      ) : signedIn ? (
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
            loading={actions.comment.isPending}
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
      {query.isPending ? (
        <SkeletonRows rows={2} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} size="sm" />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Комментариев пока нет.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map((item) => (
            <li key={item.id} className="flex gap-2.5" data-testid="news-comment">
              <Avatar
                src={item.author?.avatar ?? null}
                name={item.author?.username ?? 'Игрок'}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  {item.author ? (
                    <Link
                      href={`/u/${encodeURIComponent(item.author.username)}`}
                      className="truncate text-sm font-medium hover:underline"
                    >
                      {item.author.username}
                    </Link>
                  ) : null}
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
                <div className="mt-1 flex flex-wrap gap-1">
                  {REACTION_KEYS.map((key) => {
                    const { icon: Icon, label } = ACTIVITY_REACTION_META[key];
                    const count =
                      item.reactions.find((reaction) => reaction.key === key)?.count ?? 0;
                    if (!signedIn && count === 0) return null;
                    return (
                      <button
                        key={key}
                        type="button"
                        aria-label={`${label}${count ? `: ${count}` : ''}`}
                        aria-pressed={item.myReaction === key}
                        aria-disabled={!signedIn || undefined}
                        onClick={() =>
                          signedIn &&
                          actions.react.mutate(
                            { commentId: item.id, key },
                            { onError: (error) => toast.error(getErrorMessage(error)) },
                          )
                        }
                        className={cn(
                          'inline-flex h-6 items-center gap-1 rounded-full px-2 text-xs tabular-nums',
                          item.myReaction === key
                            ? 'bg-primary-soft text-primary-soft-foreground'
                            : 'text-muted-foreground hover:bg-muted',
                        )}
                      >
                        <Icon aria-hidden className="size-3" />
                        {count ? formatNumber(count) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {query.hasNextPage ? (
        <Button
          size="sm"
          variant="secondary"
          className="self-center"
          loading={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          Показать ещё
        </Button>
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Удалить комментарий?"
        description="Комментарий исчезнет из новости."
        confirmLabel="Удалить"
        destructive
        onConfirm={async () => {
          if (removing) await actions.remove.mutateAsync(removing);
        }}
      />
    </section>
  );
}

export default function NewsArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  const signedIn = useAuthStore((state) => state.status === 'authenticated');
  const article = useNewsArticle(slug);
  const actions = useNewsActions(slug);

  if (article.isPending) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <SkeletonRows rows={8} />
      </div>
    );
  }
  if (article.isError) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        {article.error instanceof ApiError && article.error.status === 404 ? (
          <EmptyState
            icon={<Newspaper />}
            title="Новость не найдена"
            description="Её сняли с публикации или ссылка неверная."
          />
        ) : (
          <ErrorState error={article.error} onRetry={() => article.refetch()} />
        )}
      </div>
    );
  }
  const data = article.data;
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success('Ссылка на новость скопирована');
    } catch {
      toast.info(window.location.href);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-8 md:px-6">
      <article
        className="flex flex-col gap-4 rounded-xl bg-surface p-6 shadow-sm"
        data-testid="news-article"
      >
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge tone="primary">{CATEGORY_LABEL[data.category]}</Badge>
          {data.publishedAt ? <span>{formatDate(data.publishedAt)}</span> : null}
          {data.author ? <span>· {data.author.username}</span> : null}
        </div>
        <h1 className="font-display text-3xl font-bold leading-tight">{data.title}</h1>
        {data.tags.length ? (
          <div className="flex flex-wrap gap-1.5">
            {data.tags.map((tag) => (
              <Badge key={tag.id} tone="neutral">
                #{tag.name}
              </Badge>
            ))}
          </div>
        ) : null}
        <SafeMarkdown source={data.content} className="text-base leading-relaxed" />
        <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3">
          <Button
            size="sm"
            variant={data.liked ? 'primary' : 'secondary'}
            aria-pressed={data.liked}
            disabled={!signedIn}
            loading={actions.like.isPending}
            onClick={() =>
              actions.like.mutate(data.id, {
                onError: (error) => toast.error(getErrorMessage(error)),
              })
            }
          >
            <Heart />
            {formatNumber(data.likesCount)}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void share()}>
            <Link2 />
            Поделиться
          </Button>
          <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            <Eye aria-hidden className="size-3.5" />
            {formatNumber(data.viewsCount)}
          </span>
        </div>
      </article>
      <Comments article={data} />
    </div>
  );
}
