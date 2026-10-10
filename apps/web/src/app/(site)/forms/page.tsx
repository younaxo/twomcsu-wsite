'use client';

import { ClipboardList } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/admin/page-header';
import { ModuleGate } from '@/components/system/site-availability';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { SkeletonRows } from '@/components/ui/skeleton';
import { useAuthStore } from '@/lib/auth/store';
import { formatDate } from '@/lib/format';
import { useForms, useMyFormResponses } from '@/lib/forms/hooks';

/// Формы (срез 3.6, ADR-0122): открытые формы и «Мои ответы» (с черновиками).

function FormsList({ signedIn }: { signedIn: boolean }) {
  const forms = useForms(signedIn);
  if (forms.isPending) return <SkeletonRows rows={4} />;
  if (forms.isError) return <ErrorState error={forms.error} onRetry={() => forms.refetch()} />;
  if (forms.data.length === 0) {
    return (
      <EmptyState
        icon={<ClipboardList />}
        title="Открытых форм нет"
        description="Когда администрация опубликует анкету или опрос, он появится здесь."
      />
    );
  }
  return (
    <ul
      className="flex flex-col divide-y divide-border-subtle rounded-xl bg-surface shadow-sm"
      data-testid="forms-list"
    >
      {forms.data.map((form) => (
        <li key={form.id}>
          <Link
            href={`/forms/${encodeURIComponent(form.slug)}`}
            className="flex flex-col gap-0.5 px-4 py-3 hover:bg-muted/40"
          >
            <span className="text-sm font-medium">{form.title}</span>
            {form.closesAt ? (
              <span className="text-xs text-subtle-foreground">
                Приём ответов до {formatDate(form.closesAt)}
              </span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function MyResponses() {
  const mine = useMyFormResponses(true);
  if (mine.isPending || mine.isError || mine.data.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">Мои ответы</h2>
      <ul
        className="flex flex-col divide-y divide-border-subtle rounded-xl bg-surface shadow-sm"
        data-testid="my-form-responses"
      >
        {mine.data.map((response) => (
          <li key={response.id}>
            <Link
              href={`/forms/${encodeURIComponent(response.form.slug)}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40"
            >
              <span className="min-w-0 flex-1 truncate text-sm">{response.form.title}</span>
              <Badge tone={response.isComplete ? 'success' : 'warning'}>
                {response.isComplete ? 'Отправлен' : 'Черновик'}
              </Badge>
              <span className="text-xs text-subtle-foreground">
                {formatDate(response.completedAt ?? response.createdAt)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function FormsContent() {
  const signedIn = useAuthStore((state) => state.status === 'authenticated');
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-8 md:px-6">
      <PageHeader title="Формы" description="Анкеты, заявки и опросы twomc.su." />
      <FormsList signedIn={signedIn} />
      {signedIn ? <MyResponses /> : null}
    </div>
  );
}

/// Страница модуля «forms» (ADR-0082): выключен или на техработах — понятное состояние.
export default function FormsPage() {
  return (
    <ModuleGate module="forms">
      <FormsContent />
    </ModuleGate>
  );
}
