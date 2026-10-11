'use client';

import { PageHeader } from '@/components/admin/page-header';
import { PermissionGate } from '@/components/admin/permission-gate';
import { TopicEditor } from '../_components/topic-editor';

/// Новая тема (срез 7.4, ADR-0145).
export default function AdminTopicCreatePage() {
  return (
    <PermissionGate requirement="topics.create">
      <div className="flex flex-col gap-4">
        <PageHeader title="Новая тема" />
        <TopicEditor topic={null} />
      </div>
    </PermissionGate>
  );
}
