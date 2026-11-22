'use client';

import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/admin/page-header';
import { PermissionGate } from '@/components/admin/permission-gate';
import { ErrorState } from '@/components/ui/error-state';
import { SkeletonRows } from '@/components/ui/skeleton';
import { responsesCountOf, toDraft } from '@/lib/admin/form-builder';
import { useAdminForm } from '@/lib/admin/forms';
import { FormBuilder } from '../../_components/form-builder';

/// Правка формы (право `forms.edit`): настройки и поля. У формы с ответами
/// поля заблокированы (ADR-0152) — правится копия.

function EditContent({ id }: { id: string }) {
  const form = useAdminForm(id);
  if (form.isPending) return <SkeletonRows rows={6} />;
  if (form.isError) return <ErrorState error={form.error} onRetry={() => form.refetch()} />;
  return (
    <>
      <PageHeader
        title={`Правка: ${form.data.title}`}
        breadcrumbs={[
          { label: 'Контент' },
          { label: 'Формы', href: '/admin/forms' },
          { label: 'Правка' },
        ]}
        description={`/forms/${form.data.slug}`}
      />
      <FormBuilder
        mode="edit"
        formId={id}
        initial={toDraft(form.data)}
        responsesCount={responsesCountOf(form.data)}
      />
    </>
  );
}

export default function EditFormPage() {
  const params = useParams<{ id: string }>();
  return (
    <PermissionGate requirement={{ allOf: ['forms.view', 'forms.edit'] }}>
      <div className="flex flex-col gap-4">
        <EditContent id={params.id} />
      </div>
    </PermissionGate>
  );
}
