'use client';

import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { CheckboxField } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input, Textarea, inputClassName } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
import { FormFieldInput } from '@/components/forms/form-field-input';
import {
  CHOICE_TYPES,
  FIELD_LIMIT,
  FIELD_TYPES,
  FIELD_TYPE_LABEL,
  OPTION_TYPES,
  VISIBILITY_LABEL,
  emptyField,
  hasErrors,
  toPreviewField,
  useCreateForm,
  useUpdateForm,
  validateDraft,
  type BuilderErrors,
  type DraftField,
  type DraftForm,
  type DraftSettings,
} from '@/lib/admin/form-builder';
import { getErrorMessage } from '@/lib/api/errors';
import type { FormFieldType } from '@/lib/forms/hooks';

/// Конструктор формы: настройки, поля (тип, вопрос, порядок, варианты) и
/// предпросмотр тем же компонентом, которым форму заполняют на сайте.
/// Сохранение — `POST /admin/forms` (право `forms.create`) или
/// `PATCH /admin/forms/:id` (`forms.edit`); публикация — отдельным действием в списке.

/// Типы, которые в предпросмотре подгружают данные с сервера: показываем
/// статичную заглушку, чтобы предпросмотр не делал лишних запросов.
const STATIC_PREVIEW = new Set<FormFieldType>([
  'SERVER_SELECTOR',
  'FRIENDS_SELECTOR',
  'NEWS_REFERENCE',
  'TOPIC_REFERENCE',
]);

const NO_ERRORS: BuilderErrors = { byField: {} };

function FieldCard({
  field,
  index,
  total,
  error,
  locked,
  onChange,
  onMove,
  onRemove,
}: {
  field: DraftField;
  index: number;
  total: number;
  error?: string;
  locked: boolean;
  onChange: (patch: Partial<DraftField>) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  const number = index + 1;
  return (
    <li
      data-testid="builder-field"
      className="flex flex-col gap-3 rounded-xl bg-surface p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold">Поле {number}</span>
        {locked ? null : (
          <span className="flex gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={index === 0}
              aria-label={`Поднять поле ${number}`}
              onClick={() => onMove(-1)}
            >
              <ArrowUp />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={index === total - 1}
              aria-label={`Опустить поле ${number}`}
              onClick={() => onMove(1)}
            >
              <ArrowDown />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={total <= 1}
              aria-label={`Удалить поле ${number}`}
              onClick={onRemove}
            >
              <Trash2 />
            </Button>
          </span>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Вопрос" required error={error}>
          <Input
            value={field.label}
            maxLength={200}
            disabled={locked}
            onChange={(event) => onChange({ label: event.target.value })}
          />
        </Field>
        <Field label="Тип поля">
          <select
            className={inputClassName}
            value={field.type}
            disabled={locked}
            onChange={(event) => onChange({ type: event.target.value as FormFieldType })}
          >
            {FIELD_TYPES.map((type) => (
              <option key={type} value={type}>
                {FIELD_TYPE_LABEL[type]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Подсказка под вопросом">
          <Input
            value={field.description}
            maxLength={1000}
            disabled={locked}
            onChange={(event) => onChange({ description: event.target.value })}
          />
        </Field>
        <Field label="Текст-подсказка в поле">
          <Input
            value={field.placeholder}
            maxLength={200}
            disabled={locked}
            onChange={(event) => onChange({ placeholder: event.target.value })}
          />
        </Field>
        {OPTION_TYPES.has(field.type) ? (
          <Field
            label="Варианты"
            required={CHOICE_TYPES.has(field.type)}
            hint="По одному варианту в строке"
            className="sm:col-span-2"
          >
            <Textarea
              rows={4}
              value={field.optionsText}
              disabled={locked}
              onChange={(event) => onChange({ optionsText: event.target.value })}
            />
          </Field>
        ) : null}
      </div>
      <CheckboxField
        label="Обязательное поле"
        checked={field.isRequired}
        disabled={locked}
        onCheckedChange={(checked) => onChange({ isRequired: checked === true })}
      />
    </li>
  );
}

function Preview({ draft }: { draft: DraftForm }) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const fields = draft.fields.map(toPreviewField);
  return (
    <div className="flex max-w-2xl flex-col gap-4" data-testid="builder-preview">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-xl font-bold">
          {draft.settings.title.trim() || 'Название формы'}
        </h2>
        {draft.settings.description.trim() ? (
          <p className="whitespace-pre-line text-sm text-muted-foreground">
            {draft.settings.description.trim()}
          </p>
        ) : null}
      </div>
      {fields.map((field) =>
        STATIC_PREVIEW.has(field.type) ? (
          <Field
            key={field.id}
            label={field.label}
            required={field.isRequired}
            hint="Список подставится из данных сайта"
          >
            <select className={inputClassName} disabled>
              <option>{FIELD_TYPE_LABEL[field.type]}</option>
            </select>
          </Field>
        ) : (
          <FormFieldInput
            key={field.id}
            field={field}
            value={values[field.id]}
            onChange={(value) => setValues((current) => ({ ...current, [field.id]: value }))}
          />
        ),
      )}
      <p className="text-xs text-subtle-foreground">
        Предпросмотр: ответы здесь не сохраняются и не отправляются.
      </p>
    </div>
  );
}

export function FormBuilder({
  mode,
  formId,
  initial,
  responsesCount = 0,
}: {
  mode: 'create' | 'edit';
  formId?: string;
  initial: DraftForm;
  /// У формы с ответами поля заблокированы: правятся только настройки.
  responsesCount?: number;
}) {
  const router = useRouter();
  const create = useCreateForm();
  const update = useUpdateForm(formId ?? '');
  const [draft, setDraft] = useState<DraftForm>(initial);
  const [errors, setErrors] = useState<BuilderErrors>(NO_ERRORS);
  const locked = mode === 'edit' && responsesCount > 0;
  const pending = create.isPending || update.isPending;

  const setSettings = (patch: Partial<DraftSettings>) =>
    setDraft((current) => ({ ...current, settings: { ...current.settings, ...patch } }));
  const setField = (key: string, patch: Partial<DraftField>) =>
    setDraft((current) => ({
      ...current,
      fields: current.fields.map((field) => (field.key === key ? { ...field, ...patch } : field)),
    }));
  const move = (index: number, delta: -1 | 1) =>
    setDraft((current) => {
      const fields = [...current.fields];
      const target = index + delta;
      if (target < 0 || target >= fields.length) return current;
      [fields[index], fields[target]] = [fields[target]!, fields[index]!];
      return { ...current, fields };
    });
  const remove = (key: string) =>
    setDraft((current) => ({
      ...current,
      fields: current.fields.filter((field) => field.key !== key),
    }));
  const add = () =>
    setDraft((current) => ({ ...current, fields: [...current.fields, emptyField()] }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next = validateDraft(draft, mode);
    setErrors(next);
    if (hasErrors(next)) {
      toast.error('Проверьте форму: есть незаполненные поля');
      return;
    }
    const onError = (error: unknown) => toast.error(getErrorMessage(error));
    if (mode === 'create') {
      create.mutate(draft, {
        onSuccess: () => {
          toast.success('Форма создана как черновик');
          router.push('/admin/forms');
        },
        onError,
      });
    } else {
      update.mutate(
        { draft, withFields: !locked },
        {
          onSuccess: () => {
            toast.success('Форма сохранена');
            router.push('/admin/forms');
          },
          onError,
        },
      );
    }
  };

  const { settings } = draft;
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Tabs defaultValue="editor" variant="line">
        <TabsList aria-label="Конструктор формы">
          <TabsTrigger value="editor">Редактор</TabsTrigger>
          <TabsTrigger value="preview">Предпросмотр</TabsTrigger>
        </TabsList>
        <TabsContent value="editor" className="flex flex-col gap-6 pt-4">
          <section aria-label="Настройки формы" className="grid max-w-3xl gap-3 sm:grid-cols-2">
            <Field label="Название" required error={errors.title}>
              <Input
                value={settings.title}
                maxLength={200}
                onChange={(event) => setSettings({ title: event.target.value })}
              />
            </Field>
            <Field
              label="Адрес (slug)"
              required={mode === 'create'}
              error={errors.slug}
              hint={
                mode === 'create'
                  ? 'Страница: /forms/slug. Строчные латинские буквы, цифры, дефис'
                  : 'Адрес после создания не меняется'
              }
            >
              <Input
                value={settings.slug}
                maxLength={160}
                spellCheck={false}
                disabled={mode === 'edit'}
                onChange={(event) => setSettings({ slug: event.target.value.toLowerCase() })}
              />
            </Field>
            <Field label="Описание" className="sm:col-span-2">
              <Textarea
                rows={3}
                value={settings.description}
                maxLength={2000}
                onChange={(event) => setSettings({ description: event.target.value })}
              />
            </Field>
            <Field label="Кто видит форму">
              <select
                className={inputClassName}
                value={settings.visibility}
                onChange={(event) => setSettings({ visibility: event.target.value })}
              >
                {Object.entries(VISIBILITY_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Сообщение после отправки">
              <Input
                value={settings.thankYouMessage}
                maxLength={1000}
                onChange={(event) => setSettings({ thankYouMessage: event.target.value })}
              />
            </Field>
            <div className="flex flex-col sm:col-span-2">
              <CheckboxField
                label="Только для вошедших на сайт"
                checked={settings.requiresAuth}
                onCheckedChange={(checked) => setSettings({ requiresAuth: checked === true })}
              />
              <CheckboxField
                label="Один ответ от пользователя"
                checked={settings.onePerUser}
                onCheckedChange={(checked) => setSettings({ onePerUser: checked === true })}
              />
              <CheckboxField
                label="Анонимные ответы"
                checked={settings.isAnonymous}
                onCheckedChange={(checked) => setSettings({ isAnonymous: checked === true })}
              />
            </div>
          </section>

          <section aria-label="Поля формы" className="flex max-w-3xl flex-col gap-3">
            <h2 className="font-display text-lg font-semibold">Поля</h2>
            {locked ? (
              <p
                role="status"
                className="rounded-lg bg-warning-soft px-4 py-2 text-sm text-warning"
              >
                У формы уже есть ответы ({responsesCount}), поэтому поля менять нельзя: ответы
                пропали бы. Сделайте копию формы и правьте её. Настройки сохраняются как обычно.
              </p>
            ) : null}
            {errors.fields ? (
              <p role="alert" className="text-sm text-destructive">
                {errors.fields}
              </p>
            ) : null}
            <ol className="flex flex-col gap-3" data-testid="builder-fields">
              {draft.fields.map((field, index) => (
                <FieldCard
                  key={field.key}
                  field={field}
                  index={index}
                  total={draft.fields.length}
                  error={errors.byField[field.key]}
                  locked={locked}
                  onChange={(patch) => setField(field.key, patch)}
                  onMove={(delta) => move(index, delta)}
                  onRemove={() => remove(field.key)}
                />
              ))}
            </ol>
            {locked ? null : (
              <Button
                type="button"
                variant="secondary"
                className="self-start"
                disabled={draft.fields.length >= FIELD_LIMIT}
                onClick={add}
              >
                <Plus />
                Добавить поле
              </Button>
            )}
          </section>
        </TabsContent>
        <TabsContent value="preview" className="pt-4">
          <Preview draft={draft} />
        </TabsContent>
      </Tabs>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={pending}>
          {mode === 'create' ? 'Создать черновик' : 'Сохранить'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push('/admin/forms')}>
          Отмена
        </Button>
      </div>
    </form>
  );
}
