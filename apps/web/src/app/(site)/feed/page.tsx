'use client';

import { PageHeader } from '@/components/admin/page-header';
import { ActivityFeed } from '@/components/activity/activity-feed';

/// «Лента» (срез 2.6, ADR-0114): публичная активность игроков с открытым профилем.
export default function FeedPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-3 py-6 md:px-6">
      <PageHeader title="Лента" description="Что происходит у игроков twomc.su." />
      <section className="rounded-xl bg-surface py-2 shadow-sm" aria-label="Лента активности">
        <ActivityFeed emptyText="Публичной активности пока нет." />
      </section>
    </div>
  );
}
