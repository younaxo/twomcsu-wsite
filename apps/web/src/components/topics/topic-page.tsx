'use client';

import { FileQuestion } from 'lucide-react';
import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/admin/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { TopicArticle } from './topic-article';

/// Страница темы `/rules/[slug]`, `/info/[slug]` (срез 3.2): заголовок — из
/// темы; нет темы — «не найдена».
export function TopicPage({ backLabel }: { backLabel: string }) {
  const { slug } = useParams<{ slug: string }>();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 md:px-6">
      <TopicArticle
        slug={slug}
        onTitle={(title) => <PageHeader title={title} description={backLabel} />}
        fallback={
          <EmptyState
            icon={<FileQuestion />}
            title="Документ не найден"
            description="Его удалили или ссылка неверная."
          />
        }
      />
    </div>
  );
}
