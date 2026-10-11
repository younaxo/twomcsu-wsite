'use client';

import { PageHeader } from '@/components/admin/page-header';
import { PermissionGate } from '@/components/admin/permission-gate';
import { NewsEditor } from '../_components/news-editor';

/// Новая новость (срез 7.4, ADR-0143).
export default function AdminNewsCreatePage() {
  return (
    <PermissionGate requirement="news.create">
      <div className="flex flex-col gap-4">
        <PageHeader title="Новая новость" />
        <NewsEditor article={null} />
      </div>
    </PermissionGate>
  );
}
