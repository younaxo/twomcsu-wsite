'use client';

import { ClipboardList } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { PermissionGate } from '@/components/admin/permission-gate';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Input, inputClassName } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { SkeletonRows } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import {
  ADMIN_FORMS_PAGE_SIZE,
  FORM_STATUS_LABEL,
  useAdminFormActions,
  useAdminForms,
  type AdminFormListItem,
  type FormStatus,
} from '@/lib/admin/forms';
import { getErrorMessage } from '@/lib/api/errors';
import { usePermissions } from '@/lib/auth/use-permissions';
import { formatDate } from '@/lib/format';

/// Формы в админке (срез 7.4, ADR-0149): список с фильтром по статусу и
/// поиском; публикация, закрытие, копия и удаление — по своим правам
/// `forms.*`. Ответы и статистика — на странице формы.

function FormsList() {
  const { can } = usePermissions();
  const [status, setStatus] = useState<FormStatus | ''>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const forms = useAdminForms(status, search, page);
  const { setStatus: changeStatus, duplicate, remove } = useAdminFormActions();
  const [deleting, setDeleting] = useState<AdminFormListItem | null>(null);
  const totalPages = forms.data
    ? Math.max(1, Math.ceil(forms.data.total / ADMIN_FORMS_PAGE_SIZE))
    : 1;
  const onError = (error: unknown) => toast.error(getErrorMessage(error));
  const canOpen = can(['forms.responses', 'forms.stats']);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Input
          aria-label="Поиск по названию"
          placeholder="Поиск по названию"
          className="w-56"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <select
          aria-label="Статус"
          className={`${inputClassName} w-auto`}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as FormStatus | '');
            setPage(1);
          }}
        >
          <option value="">Все статусы</option>
          {(Object.keys(FORM_STATUS_LABEL) as FormStatus[]).map((value) => (
            <option key={value} value={value}>
              {FORM_STATUS_LABEL[value]}
            </option>
          ))}
        </select>
      </div>
      {forms.isPending ? (
        <SkeletonRows rows={5} />
      ) : forms.isError ? (
        <ErrorState error={forms.error} onRetry={() => forms.refetch()} />
      ) : forms.data.items.length === 0 ? (
        <EmptyState icon={<ClipboardList />} title="Форм нет" />
      ) : (
        <>
          <ul
            className="flex flex-col divide-y divide-border-subtle rounded-xl bg-surface shadow-sm"
            data-testid="admin-forms"
          >
            {forms.data.items.map((form) => (
              <li key={form.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {canOpen ? (
                      <Link
                        href={`/admin/forms/${encodeURIComponent(form.id)}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {form.title}
                      </Link>
                    ) : (
                      <span className="text-sm font-medium">{form.title}</span>
                    )}
                    <Badge tone={form.status === 'PUBLISHED' ? 'success' : 'neutral'}>
                      {FORM_STATUS_LABEL[form.status]}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    полей: {form._count.fields} · ответов: {form._count.responses} · создана{' '}
                    {formatDate(form.createdAt)}
                  </span>
                </div>
                <span className="flex flex-wrap gap-1">
                  {can('forms.publish') && form.status !== 'PUBLISHED' ? (
                    <Button
                      size="sm"
                      onClick={() =>
                        changeStatus.mutate(
                          { id: form.id, action: 'publish' },
                          { onSuccess: () => toast.success('Форма открыта'), onError },
                        )
                      }
                    >
                      Опубликовать
                    </Button>
                  ) : null}
                  {can('forms.close') && form.status === 'PUBLISHED' ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        changeStatus.mutate(
                          { id: form.id, action: 'close' },
                          { onSuccess: () => toast.success('Приём ответов закрыт'), onError },
                        )
                      }
                    >
                      Закрыть
                    </Button>
                  ) : null}
                  {can('forms.duplicate') ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        duplicate.mutate(form.id, {
                          onSuccess: () => toast.success('Копия создана — черновик'),
                          onError,
                        })
                      }
                    >
                      Копия
                    </Button>
                  ) : null}
                  {can('forms.delete') ? (
                    <Button size="sm" variant="ghost" onClick={() => setDeleting(form)}>
                      Удалить
                    </Button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          {totalPages > 1 ? (
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          ) : null}
        </>
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Удалить форму «${deleting?.title ?? ''}»?`}
        description={`Вместе с ней удалятся все ответы (${deleting?._count.responses ?? 0}). Действие необратимо.`}
        confirmLabel="Удалить"
        destructive
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(deleting!.id, {
            onSuccess: () => {
              toast.success('Форма удалена');
              setDeleting(null);
            },
            onError,
          })
        }
      />
    </>
  );
}

export default function AdminFormsPage() {
  return (
    <PermissionGate requirement="forms.view">
      <div className="flex flex-col gap-4">
        <PageHeader title="Формы" description="Анкеты, заявки и опросы — ответы и статистика." />
        <FormsList />
      </div>
    </PermissionGate>
  );
}
