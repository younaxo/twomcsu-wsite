'use client';

import { BookOpen, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { PermissionGate } from '@/components/admin/permission-gate';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { inputClassName } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import {
  TOPIC_CATEGORY_LABEL,
  TOPIC_VISIBILITY_LABEL,
  useAdminTopicActions,
  useAdminTopics,
  type AdminTopicListItem,
  type TopicCategory,
} from '@/lib/admin/topics';
import { getErrorMessage } from '@/lib/api/errors';
import { usePermissions } from '@/lib/auth/use-permissions';
import { formatDate } from '@/lib/format';

/// Темы в админке (срез 7.4, ADR-0145): правила, FAQ, информация и
/// юридические документы; фильтр по разделу, закреп и удаление — по своим
/// правам `topics.*`.

function TopicsList() {
  const { can } = usePermissions();
  const topics = useAdminTopics();
  const { remove, pin } = useAdminTopicActions();
  const [category, setCategory] = useState<TopicCategory | ''>('');
  const [deleting, setDeleting] = useState<AdminTopicListItem | null>(null);
  const items = (topics.data ?? []).filter((topic) => !category || topic.category === category);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {can('topics.create') ? (
          <Button asChild>
            <Link href="/admin/topics/new">
              <Plus />
              Новая тема
            </Link>
          </Button>
        ) : null}
        <select
          aria-label="Раздел"
          className={`${inputClassName} w-auto`}
          value={category}
          onChange={(e) => setCategory(e.target.value as TopicCategory | '')}
        >
          <option value="">Все разделы</option>
          {Object.entries(TOPIC_CATEGORY_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {topics.isPending ? (
        <SkeletonRows rows={6} />
      ) : topics.isError ? (
        <ErrorState error={topics.error} onRetry={() => topics.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon={<BookOpen />} title="Тем нет" />
      ) : (
        <ul
          className="flex flex-col divide-y divide-border-subtle rounded-xl bg-surface shadow-sm"
          data-testid="admin-topics"
        >
          {items.map((topic) => (
            <li key={topic.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  {can('topics.edit') ? (
                    <Link
                      href={`/admin/topics/${encodeURIComponent(topic.id)}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {topic.title}
                    </Link>
                  ) : (
                    <span className="text-sm font-medium">{topic.title}</span>
                  )}
                  <Badge tone="neutral">{TOPIC_CATEGORY_LABEL[topic.category]}</Badge>
                  {topic.visibility === 'PUBLIC' ? null : (
                    <Badge tone="neutral">{TOPIC_VISIBILITY_LABEL[topic.visibility]}</Badge>
                  )}
                  {topic.isPinned ? <Badge tone="neutral">Закреплена</Badge> : null}
                  {topic.isActive ? null : <Badge tone="warning">Скрыта</Badge>}
                </div>
                <span className="text-xs text-muted-foreground">
                  <span className="font-mono">{topic.slug}</span> · обновлена{' '}
                  {formatDate(topic.updatedAt)} · просмотров: {topic.views}
                </span>
              </div>
              <span className="flex gap-1">
                {can('topics.pin') ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      pin.mutate(
                        { id: topic.id, pinned: !topic.isPinned },
                        { onError: (error) => toast.error(getErrorMessage(error)) },
                      )
                    }
                  >
                    {topic.isPinned ? 'Открепить' : 'Закрепить'}
                  </Button>
                ) : null}
                {can('topics.delete') ? (
                  <Button size="sm" variant="ghost" onClick={() => setDeleting(topic)}>
                    Удалить
                  </Button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Удалить тему «${deleting?.title ?? ''}»?`}
        description="Страница пропадёт с сайта вместе с текстом. Действие необратимо — чтобы просто скрыть, снимите «Опубликована» в редакторе."
        confirmLabel="Удалить"
        destructive
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(deleting!.id, {
            onSuccess: () => {
              toast.success('Тема удалена');
              setDeleting(null);
            },
            onError: (error) => toast.error(getErrorMessage(error)),
          })
        }
      />
    </>
  );
}

export default function AdminTopicsPage() {
  return (
    <PermissionGate requirement="topics.view">
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Темы"
          description="Правила, FAQ, информационные страницы и юридические документы."
        />
        <TopicsList />
      </div>
    </PermissionGate>
  );
}
