'use client';

import { CircleHelp } from 'lucide-react';
import { PageHeader } from '@/components/admin/page-header';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { SafeMarkdown } from '@/components/ui/safe-markdown';
import { SkeletonRows } from '@/components/ui/skeleton';
import { useTopics } from '@/components/topics/topic-article';

/// «Частые вопросы» (срез 3.2): темы категории FAQ — вопрос и ответ
/// (безопасный Markdown). Пусто — честное состояние.
export default function FaqPage() {
  const topics = useTopics('FAQ');
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 md:px-6">
      <PageHeader title="Частые вопросы" description="Ответы на вопросы игроков twomc.su." />
      {topics.isPending ? (
        <SkeletonRows rows={5} />
      ) : topics.isError ? (
        <ErrorState error={topics.error} onRetry={() => topics.refetch()} />
      ) : topics.data.length === 0 ? (
        <EmptyState
          icon={<CircleHelp />}
          title="Вопросов пока нет"
          description="Администрация готовит ответы."
        />
      ) : (
        <Accordion
          type="multiple"
          className="rounded-xl bg-surface px-5 shadow-sm"
          data-testid="faq"
        >
          {topics.data.map((topic) => (
            <AccordionItem key={topic.id} value={topic.slug}>
              <AccordionTrigger>{topic.title}</AccordionTrigger>
              <AccordionContent>
                <SafeMarkdown source={topic.content} />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}
