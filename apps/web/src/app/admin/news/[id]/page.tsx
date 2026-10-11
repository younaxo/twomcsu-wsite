'use client';

import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/admin/page-header';
import { PermissionGate } from '@/components/admin/permission-gate';
import { ErrorState } from '@/components/ui/error-state';
import { SkeletonRows } from '@/components/ui/skeleton';
import { useAdminNewsArticle } from '@/lib/admin/news';
import { NewsEditor } from '../_components/news-editor';

/// Правка новости (срез 7.4, ADR-0143).
function Editor({ id }: { id: string }) {
  const article = useAdminNewsArticle(id);
  if (article.isPending) return <SkeletonRows rows={8} />;
  if (article.isError) {
    return <ErrorState error={article.error} onRetry={() => article.refetch()} />;
  }
  return (
    <>
      <PageHeader title={article.data.title} description={`/news/${article.data.slug}`} />
      <NewsEditor key={article.data.id} article={article.data} />
    </>
  );
}

export default function AdminNewsEditPage() {
  const params = useParams<{ id: string }>();
  return (
    <PermissionGate requirement="news.edit">
      <div className="flex flex-col gap-4">
        <Editor id={params.id} />
      </div>
    </PermissionGate>
  );
}
