'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { RequireSession } from '@/components/auth/require-session';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { getErrorMessage } from '@/lib/api/errors';
import { REPORT_TYPES, useSupportActions, type ReportType } from '@/lib/support/hooks';

/// Новое обращение по типу (срез 3.5, ADR-0120): для жалоб — ник нарушителя
/// (обязателен), сервер по желанию, описание. Отправка — на страницу обращения.
export default function NewReportPage() {
  const params = useParams<{ type: string }>();
  const type = params.type.toUpperCase() as ReportType;
  const meta = REPORT_TYPES[type];
  const router = useRouter();
  const { create } = useSupportActions();
  const [target, setTarget] = useState('');
  const [server, setServer] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!meta) {
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        <EmptyState
          title="Такого типа обращения нет"
          description="Выберите тип на странице «Обращения»."
        />
      </div>
    );
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (meta.needsTarget && !target.trim()) {
      setError('Укажите ник нарушителя.');
      return;
    }
    if (!description.trim()) {
      setError('Опишите, что произошло.');
      return;
    }
    setError(null);
    create.mutate(
      {
        type,
        description: description.trim(),
        targets: target.trim() ? [{ username: target.trim() }] : [],
        ...(server.trim() ? { server: server.trim() } : {}),
      },
      {
        onSuccess: (report) => router.push(`/support/${encodeURIComponent(report.reportNumber)}`),
        onError: (failure) => setError(getErrorMessage(failure)),
      },
    );
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-8 md:px-6">
      <PageHeader title={meta.label} description={meta.description} />
      <RequireSession>
        <form
          className="flex flex-col gap-4 rounded-xl bg-surface p-5 shadow-sm"
          onSubmit={submit}
          noValidate
          data-testid="report-form"
        >
          {meta.needsTarget ? (
            <Field label="Ник нарушителя" required>
              <Input
                value={target}
                spellCheck={false}
                onChange={(event) => setTarget(event.target.value)}
              />
            </Field>
          ) : null}
          <Field label="Сервер" hint="Если связано с сервером">
            <Input
              value={server}
              maxLength={100}
              onChange={(event) => setServer(event.target.value)}
            />
          </Field>
          <Field
            label="Описание"
            required
            error={error}
            hint="До 5000 символов. Ссылки на доказательства — в тексте."
          >
            <Textarea
              value={description}
              maxLength={5000}
              rows={6}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
          <Button type="submit" className="self-end" loading={create.isPending}>
            Отправить обращение
          </Button>
        </form>
      </RequireSession>
    </div>
  );
}
