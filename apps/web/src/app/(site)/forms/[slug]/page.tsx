'use client';

import { ClipboardList } from 'lucide-react';
import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/admin/page-header';
import { FormFiller } from '@/components/forms/form-filler';
import { ModuleGate } from '@/components/system/site-availability';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { SkeletonRows } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api/errors';
import { useAuthStore } from '@/lib/auth/store';
import { useForm } from '@/lib/forms/hooks';

/// Форма (срез 3.6, ADR-0122). Скрытая или несуществующая — «не найдена».
function FormContent() {
  const { slug } = useParams<{ slug: string }>();
  const signedIn = useAuthStore((state) => state.status === 'authenticated');
  const form = useForm(slug, signedIn);
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-8 md:px-6">
      {form.isPending ? (
        <SkeletonRows rows={5} />
      ) : form.isError ? (
        form.error instanceof ApiError && form.error.status === 404 ? (
          <EmptyState
            icon={<ClipboardList />}
            title="Форма не найдена"
            description="Возможно, она закрыта или доступна не всем."
          />
        ) : (
          <ErrorState error={form.error} onRetry={() => form.refetch()} />
        )
      ) : (
        <>
          <PageHeader title={form.data.title} />
          <FormFiller form={form.data} />
        </>
      )}
    </div>
  );
}

export default function FormPage() {
  return (
    <ModuleGate module="forms">
      <FormContent />
    </ModuleGate>
  );
}
