'use client';

import { ClipboardList } from 'lucide-react';
import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/admin/page-header';
import { FormFiller } from '@/components/forms/form-filler';
import { ModuleGate } from '@/components/system/site-availability';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { SkeletonRows } from '@/components/ui/skeleton';
import { ApiError, getErrorMessage } from '@/lib/api/errors';
import { useInviteForm } from '@/lib/forms/hooks';

/// Форма по приглашению (срез 3.6, ADR-0122): код передаётся при отправке и
/// сохранении черновика. Истёкшее или исчерпанное — понятное состояние.
function InviteContent() {
  const { code } = useParams<{ code: string }>();
  const form = useInviteForm(code);
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-8 md:px-6">
      {form.isPending ? (
        <SkeletonRows rows={5} />
      ) : form.isError ? (
        form.error instanceof ApiError && [403, 404].includes(form.error.status) ? (
          <EmptyState
            icon={<ClipboardList />}
            title="Приглашение недействительно"
            description={getErrorMessage(form.error)}
          />
        ) : (
          <ErrorState error={form.error} onRetry={() => form.refetch()} />
        )
      ) : (
        <>
          <PageHeader title={form.data.title} />
          <FormFiller form={form.data} inviteCode={code} />
        </>
      )}
    </div>
  );
}

export default function InviteFormPage() {
  return (
    <ModuleGate module="forms">
      <InviteContent />
    </ModuleGate>
  );
}
