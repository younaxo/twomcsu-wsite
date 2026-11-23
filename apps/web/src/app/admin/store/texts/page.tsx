'use client';

import { TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { FormErrorSummary, FormField as Field } from '@/components/admin/form-field';
import { PageHeader } from '@/components/admin/page-header';
import { PermissionGate } from '@/components/admin/permission-gate';
import { QueryBoundary } from '@/components/admin/query-boundary';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import {
  STORE_TEXT_FIELDS,
  describeStoreTextsError,
  useAdminStoreTexts,
  useSaveStoreTexts,
  validateStoreText,
} from '@/lib/admin/store-texts';
import type { StoreTextKey } from '@/lib/store/texts';

/// «Тексты магазина» (0.11, ADR-0189): правила снятия банов и мутов, политика
/// возвратов, описания перков и др. ключи из белого списка. Право
/// `store.settings.manage`. Только простой текст: HTML и разметка не
/// интерпретируются нигде (показываются как есть).

type Values = Record<StoreTextKey, string>;

function TextsForm({ initial }: { initial: Values }) {
  const save = useSaveStoreTexts();
  const [values, setValues] = useState<Values>(initial);
  const [errors, setErrors] = useState<Partial<Record<StoreTextKey, string>>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const initialKey = JSON.stringify(initial);
  useEffect(() => {
    setValues(JSON.parse(initialKey) as Values);
  }, [initialKey]);

  const submit = () => {
    setFailure(null);
    const next: Partial<Record<StoreTextKey, string>> = {};
    for (const field of STORE_TEXT_FIELDS) {
      const problem = validateStoreText(field.key, values[field.key] ?? '');
      if (problem) next[field.key] = problem;
    }
    setErrors(next);
    const count = Object.keys(next).length;
    if (count > 0) {
      setFailure(`Исправьте ошибки в текстах (${count}).`);
      return;
    }
    const changed = Object.fromEntries(
      STORE_TEXT_FIELDS.filter(
        (f) => (values[f.key] ?? '').trim() !== (initial[f.key] ?? '').trim(),
      ).map((f) => [f.key, values[f.key] ?? '']),
    );
    if (Object.keys(changed).length === 0) {
      toast.info('Изменений нет');
      return;
    }
    save.mutate(changed, {
      onSuccess: () => toast.success('Тексты магазина сохранены'),
      onError: (error) => setFailure(describeStoreTextsError(error)),
    });
  };

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div
        className="flex items-start gap-2 rounded-lg bg-warning-soft p-3 text-sm text-warning"
        data-testid="perks-warning"
      >
        <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
        <p>
          Не обещайте перков, которых нет в игре. Описывайте только то, что реально работает на
          серверах: игроки платят за эти обещания. Тексты простые: разметка и HTML не поддерживаются
          и показываются как обычный текст.
        </p>
      </div>
      {failure ? <FormErrorSummary data-testid="texts-error">{failure}</FormErrorSummary> : null}
      {STORE_TEXT_FIELDS.map((field) => {
        const value = values[field.key] ?? '';
        const length = value.trim().length;
        return (
          <Field
            key={field.key}
            label={field.label}
            error={errors[field.key]}
            hint={`${field.hint} ${length} из ${field.max} символов.`}
          >
            <Textarea
              rows={field.rows}
              value={value}
              autoComplete="off"
              onChange={(event) =>
                setValues((current) => ({ ...current, [field.key]: event.target.value }))
              }
            />
          </Field>
        );
      })}
      <div>
        <Button type="submit" loading={save.isPending}>
          Сохранить тексты
        </Button>
      </div>
    </form>
  );
}

function StoreTextsContent() {
  const texts = useAdminStoreTexts();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Тексты магазина"
        description="Правила и описания, которые игроки видят в магазине."
        breadcrumbs={[{ label: 'Магазин' }, { label: 'Тексты магазина' }]}
      />
      <Card>
        <QueryBoundary query={texts}>{(data) => <TextsForm initial={data} />}</QueryBoundary>
      </Card>
    </div>
  );
}

export default function StoreTextsPage() {
  return (
    <PermissionGate
      requirement="store.settings.manage"
      title="Тексты магазина недоступны"
      description="Нужно право «Тексты и правила магазина»."
    >
      <StoreTextsContent />
    </PermissionGate>
  );
}
