'use client';

import { Inbox } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { PageHeader, PageSection } from '@/components/admin/page-header';
import { PermissionGate } from '@/components/admin/permission-gate';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Pagination } from '@/components/ui/pagination';
import { SkeletonRows } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
import {
  ADMIN_FORMS_PAGE_SIZE,
  FORM_STATUS_LABEL,
  answerText,
  useAdminForm,
  useAdminFormActions,
  useFormResponses,
  useFormStats,
  type AdminFormField,
  type FormResponseDto,
} from '@/lib/admin/forms';
import { getErrorMessage } from '@/lib/api/errors';
import { usePermissions } from '@/lib/auth/use-permissions';
import { formatDateTime } from '@/lib/format';

/// Форма в админке (срез 7.4, ADR-0149): ответы (кто ответил — только если
/// ответ не анонимный, решает API) и статистика по полям.

function who(response: FormResponseDto): string {
  return response.respondent?.tag ?? (response.isAnonymous ? 'Анонимно' : 'Гость');
}

function ResponseDialog({
  response,
  fields,
  onClose,
}: {
  response: FormResponseDto;
  fields: AdminFormField[];
  onClose: () => void;
}) {
  const byField = new Map(response.answers.map((answer) => [answer.fieldId, answer]));
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ответ</DialogTitle>
          <DialogDescription>
            {who(response)} · {formatDateTime(response.completedAt ?? response.createdAt)}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <dl className="flex flex-col gap-3" data-testid="form-response">
            {fields.map((field) => {
              const answer = byField.get(field.id);
              return (
                <div key={field.id} className="flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">{field.label}</dt>
                  <dd className="whitespace-pre-line break-words text-sm">
                    {answer ? answerText(answer, formatDateTime) : '—'}
                  </dd>
                </div>
              );
            })}
          </dl>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function Responses({ formId, fields }: { formId: string; fields: AdminFormField[] }) {
  const [page, setPage] = useState(1);
  const responses = useFormResponses(formId, page, true);
  const { removeResponse } = useAdminFormActions();
  const [open, setOpen] = useState<FormResponseDto | null>(null);
  const [deleting, setDeleting] = useState<FormResponseDto | null>(null);
  if (responses.isPending) return <SkeletonRows rows={5} />;
  if (responses.isError) {
    return <ErrorState error={responses.error} onRetry={() => responses.refetch()} />;
  }
  if (responses.data.items.length === 0) {
    return <EmptyState icon={<Inbox />} title="Ответов пока нет" />;
  }
  const totalPages = Math.max(1, Math.ceil(responses.data.total / ADMIN_FORMS_PAGE_SIZE));
  return (
    <div className="flex flex-col gap-3">
      <ul
        className="flex flex-col divide-y divide-border-subtle rounded-xl bg-surface shadow-sm"
        data-testid="form-responses"
      >
        {responses.data.items.map((response) => (
          <li key={response.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <span className="min-w-0 flex-1 text-sm">
              {who(response)}
              <span className="ml-2 text-xs text-muted-foreground">
                {formatDateTime(response.completedAt ?? response.createdAt)}
              </span>
            </span>
            {response.isComplete ? null : <Badge tone="warning">Не завершён</Badge>}
            <Button size="sm" variant="secondary" onClick={() => setOpen(response)}>
              Открыть
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDeleting(response)}>
              Удалить
            </Button>
          </li>
        ))}
      </ul>
      {totalPages > 1 ? (
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      ) : null}
      {open ? (
        <ResponseDialog response={open} fields={fields} onClose={() => setOpen(null)} />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(value) => !value && setDeleting(null)}
        title="Удалить ответ?"
        description="Ответ пропадёт из списка и статистики. Действие необратимо."
        confirmLabel="Удалить"
        destructive
        loading={removeResponse.isPending}
        onConfirm={() =>
          removeResponse.mutate(
            { formId, responseId: deleting!.id },
            {
              onSuccess: () => {
                toast.success('Ответ удалён');
                setDeleting(null);
              },
              onError: (error) => toast.error(getErrorMessage(error)),
            },
          )
        }
      />
    </div>
  );
}

function Stats({ formId }: { formId: string }) {
  const stats = useFormStats(formId, true);
  if (stats.isPending) return <SkeletonRows rows={4} />;
  if (stats.isError) return <ErrorState error={stats.error} onRetry={() => stats.refetch()} />;
  const data = stats.data;
  return (
    <div className="flex flex-col gap-4" data-testid="form-stats">
      <p className="text-sm">
        Ответов: {data.totalResponses}
        {data.maxResponses ? ` из ${data.maxResponses}` : ''} · завершено: {data.completeResponses}{' '}
        ({Math.round(data.completionRate * 100)}%)
      </p>
      <ul className="flex flex-col gap-3">
        {data.fieldStats.map((field) => {
          const entries = Object.entries(field.breakdown).sort((a, b) => b[1] - a[1]);
          return (
            <li key={field.fieldId} className="flex flex-col gap-1">
              <span className="text-sm font-medium">
                {field.label}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ответили: {field.answeredCount}
                </span>
              </span>
              {entries.length > 0 ? (
                <ul className="flex flex-col gap-1 text-xs">
                  {entries.map(([option, count]) => (
                    <li key={option} className="flex items-center gap-2">
                      <span className="w-40 truncate">{option}</span>
                      <span
                        aria-hidden
                        className="h-2 rounded bg-primary"
                        style={{
                          width: `${Math.max(4, (count / Math.max(1, field.answeredCount)) * 160)}px`,
                        }}
                      />
                      <span>{count}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function FormDetails({ id }: { id: string }) {
  const { can } = usePermissions();
  const form = useAdminForm(id);
  if (form.isPending) return <SkeletonRows rows={6} />;
  if (form.isError) return <ErrorState error={form.error} onRetry={() => form.refetch()} />;
  const canResponses = can('forms.responses');
  const canStats = can('forms.stats');
  return (
    <>
      <PageHeader
        title={form.data.title}
        description={`${FORM_STATUS_LABEL[form.data.status]} · /forms/${form.data.slug}`}
      />
      <PageSection title="Ответы и статистика">
        <Tabs defaultValue={canResponses ? 'responses' : 'stats'} variant="line">
          <TabsList aria-label="Данные формы">
            {canResponses ? <TabsTrigger value="responses">Ответы</TabsTrigger> : null}
            {canStats ? <TabsTrigger value="stats">Статистика</TabsTrigger> : null}
          </TabsList>
          {canResponses ? (
            <TabsContent value="responses" className="pt-3">
              <Responses formId={id} fields={form.data.fields} />
            </TabsContent>
          ) : null}
          {canStats ? (
            <TabsContent value="stats" className="pt-3">
              <Stats formId={id} />
            </TabsContent>
          ) : null}
        </Tabs>
      </PageSection>
    </>
  );
}

export default function AdminFormPage() {
  const params = useParams<{ id: string }>();
  return (
    <PermissionGate requirement={['forms.responses', 'forms.stats']}>
      <div className="flex flex-col gap-4">
        <FormDetails id={params.id} />
      </div>
    </PermissionGate>
  );
}
