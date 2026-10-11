'use client';

import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/admin/page-header';
import { PermissionGate } from '@/components/admin/permission-gate';
import { ErrorState } from '@/components/ui/error-state';
import { SkeletonRows } from '@/components/ui/skeleton';
import { useAdminTopic } from '@/lib/admin/topics';
import { TopicEditor } from '../_components/topic-editor';

/// Правка темы (срез 7.4, ADR-0145).
function Editor({ id }: { id: string }) {
  const topic = useAdminTopic(id);
  if (topic.isPending) return <SkeletonRows rows={8} />;
  if (topic.isError) return <ErrorState error={topic.error} onRetry={() => topic.refetch()} />;
  return (
    <>
      <PageHeader title={topic.data.title} description={topic.data.slug} />
      <TopicEditor key={topic.data.id} topic={topic.data} />
    </>
  );
}

export default function AdminTopicEditPage() {
  const params = useParams<{ id: string }>();
  return (
    <PermissionGate requirement="topics.edit">
      <div className="flex flex-col gap-4">
        <Editor id={params.id} />
      </div>
    </PermissionGate>
  );
}
