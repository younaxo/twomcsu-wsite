'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Pin } from 'lucide-react';
import { PageHeader } from '@/components/admin/page-header';
import { QueryBoundary } from '@/components/admin/query-boundary';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { api } from '@/lib/api/client';
import { formatDate } from '@/lib/format';

interface TopicListItem {
  id: string;
  slug: string;
  title: string;
  category: string;
  description: string | null;
  isPinned: boolean;
  updatedAt: string;
}

/// Правила — темы категории RULES (GET /topics?category=RULES); карточка ведёт
/// на полный текст `/rules/[slug]` (срез 3.2).
export default function RulesPage() {
  const topics = useQuery({
    queryKey: ['site', 'topics', 'RULES'],
    queryFn: () =>
      api.get<TopicListItem[]>('/topics', { auth: false, query: { category: 'RULES' } }),
  });
  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-8 px-4 py-8 md:px-6">
      <PageHeader
        title="Правила"
        description="Правила серверов и сообщества twomc.su. Незнание правил не освобождает от ответственности."
      />
      <QueryBoundary query={topics}>
        {(items) =>
          items.length === 0 ? (
            <EmptyState
              icon={<BookOpen />}
              title="Правила ещё не опубликованы"
              description="Администрация готовит документы."
            />
          ) : (
            <ul className="grid gap-4 md:grid-cols-2">
              {items.map((topic) => (
                <li key={topic.id}>
                  <Link
                    href={`/rules/${encodeURIComponent(topic.slug)}`}
                    className="block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    data-testid="rule-card"
                  >
                    <Card className="flex h-full flex-col gap-2 transition-colors hover:bg-muted/40">
                      <div className="flex items-start justify-between gap-2">
                        <h2 className="text-lg font-semibold">{topic.title}</h2>
                        {topic.isPinned ? (
                          <Badge tone="primary" icon={<Pin />}>
                            Закреплено
                          </Badge>
                        ) : null}
                      </div>
                      {topic.description ? (
                        <p className="text-sm text-muted-foreground">{topic.description}</p>
                      ) : null}
                      <p className="mt-auto text-xs text-subtle-foreground">
                        Обновлено {formatDate(topic.updatedAt)}
                      </p>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )
        }
      </QueryBoundary>
    </div>
  );
}
