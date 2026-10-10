'use client';

import { Star } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { ServersOverview } from '@twomc/shared';
import { CheckboxField } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input, Textarea, inputClassName } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { api } from '@/lib/api/client';
import { cn } from '@/lib/cn';
import { useFriends } from '@/lib/friends/hooks';
import type { FormFieldDto, FormFieldType } from '@/lib/forms/hooks';
import { useServersOverview } from '@/lib/site/hooks';

/// Поле формы по типу (срез 3.6, ADR-0122). Значение — то, что ждёт
/// `FormsService.buildAnswerData`: строка, число, булево, массив строк или
/// объект (DATE_RANGE). Загрузка файлов недоступна до хранилища (S3, R3).

export const FILE_TYPES = new Set<FormFieldType>(['FILE_UPLOAD', 'IMAGE_GALLERY']);

const INPUT_TYPE: Partial<Record<FormFieldType, string>> = {
  EMAIL: 'email',
  PHONE: 'tel',
  URL: 'url',
  VIDEO_URL: 'url',
  TIME: 'time',
  DATE: 'date',
  SCHEDULE_PICKER: 'datetime-local',
};

const HINT: Partial<Record<FormFieldType, string>> = {
  PLAYER_SELECTOR: 'Ник игрока',
  RANK_SELECTOR: 'Название ранга',
  PRODUCT_SELECTOR: 'Название товара',
  ORDER_SELECTOR: 'Номер заказа',
  REPORT_REFERENCE: 'Номер обращения',
  PUNISHMENT_REFERENCE: 'Номер наказания',
  ACHIEVEMENT_SELECTOR: 'Название достижения',
  SIGNATURE: 'Введите полное имя — это ваша подпись',
};

function optionsOf(field: FormFieldDto): string[] {
  return Array.isArray(field.options)
    ? field.options.filter((option): option is string => typeof option === 'string')
    : [];
}

interface Props {
  field: FormFieldDto;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string | null;
}

/// id/aria-* от `Field` (cloneElement) — на сам контрол, чтобы подпись и
/// ошибка были связаны с ним.
type A11y = Record<string, unknown>;

function NativeSelect({
  value,
  onChange,
  items,
  placeholder,
  ...a11y
}: {
  value: unknown;
  onChange: (value: string) => void;
  items: Array<{ value: string; label: string }>;
  placeholder?: string | null;
} & A11y) {
  return (
    <select
      {...a11y}
      className={inputClassName}
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{placeholder || 'Выберите…'}</option>
      {items.map((item) => (
        <option key={item.value} value={item.value}>
          {item.label}
        </option>
      ))}
    </select>
  );
}

function ServerSelect(props: { value: unknown; onChange: (value: string) => void } & A11y) {
  const servers = useServersOverview();
  const items = (servers.data as ServersOverview | undefined)?.servers ?? [];
  return <NativeSelect {...props} items={items.map((s) => ({ value: s.id, label: s.name }))} />;
}

function FriendSelect(props: { value: unknown; onChange: (value: string) => void } & A11y) {
  const friends = useFriends();
  return (
    <NativeSelect
      {...props}
      placeholder={friends.data?.length === 0 ? 'Друзей пока нет' : null}
      items={(friends.data ?? []).map((f) => ({ value: f.user.id, label: f.user.username }))}
    />
  );
}

function ReferenceSelect({
  path,
  pick,
  ...props
}: {
  path: '/news' | '/topics';
  pick: (data: unknown) => Array<{ id: string; title: string }>;
  value: unknown;
  onChange: (value: string) => void;
} & A11y) {
  const list = useQuery({
    queryKey: ['forms', 'reference', path],
    queryFn: () => api.get<unknown>(path, { auth: false, query: { limit: 50 } }),
    staleTime: 60_000,
  });
  return (
    <NativeSelect
      {...props}
      items={pick(list.data).map((item) => ({ value: item.id, label: item.title }))}
    />
  );
}

const itemsOf = (data: unknown) =>
  (Array.isArray(data)
    ? data
    : ((data as { items?: unknown[] } | undefined)?.items ?? [])) as Array<{
    id: string;
    title: string;
  }>;

function Control({ field, value, onChange, ...a11y }: Omit<Props, 'error'> & A11y) {
  const text = typeof value === 'string' ? value : '';
  switch (field.type) {
    case 'TEXTAREA':
    case 'MARKDOWN_EDITOR':
    case 'CODE_EDITOR':
      return (
        <Textarea
          {...a11y}
          value={text}
          rows={field.type === 'TEXTAREA' ? 4 : 8}
          maxLength={field.maxLength ?? undefined}
          placeholder={field.placeholder ?? undefined}
          className={cn(field.type === 'CODE_EDITOR' && 'font-mono text-xs')}
          spellCheck={field.type !== 'CODE_EDITOR'}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case 'RADIO':
      return (
        <RadioGroup value={text} onValueChange={onChange} className="flex flex-col gap-2">
          {optionsOf(field).map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm">
              <RadioGroupItem value={option} />
              {option}
            </label>
          ))}
        </RadioGroup>
      );
    case 'SELECT':
      return (
        <NativeSelect
          {...a11y}
          value={value}
          onChange={onChange}
          placeholder={field.placeholder}
          items={optionsOf(field).map((option) => ({ value: option, label: option }))}
        />
      );
    case 'CHECKBOX': {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="flex flex-col gap-1">
          {optionsOf(field).map((option) => (
            <CheckboxField
              key={option}
              label={option}
              checked={selected.includes(option)}
              onCheckedChange={(checked) =>
                onChange(
                  checked ? [...selected, option] : selected.filter((item) => item !== option),
                )
              }
            />
          ))}
        </div>
      );
    }
    case 'NUMBER':
    case 'CURRENCY_AMOUNT':
      return (
        // Без нативного числового input (ADR-0087): строка с цифровой клавиатурой, число из
        // неё получает сервер (`Number(value)`), запятая — как точка.
        <Input
          {...a11y}
          type="text"
          inputMode="decimal"
          value={typeof value === 'number' ? String(value) : text}
          placeholder={
            field.placeholder ??
            (field.minValue !== null && field.maxValue !== null
              ? `${field.minValue}–${field.maxValue}`
              : undefined)
          }
          onChange={(event) =>
            onChange(event.target.value.replace(',', '.').replace(/[^\d.-]/g, ''))
          }
        />
      );
    case 'RATING': {
      const max = field.maxValue ?? 5;
      const current = typeof value === 'number' ? value : 0;
      return (
        <div className="flex gap-1" role="radiogroup" aria-label={field.label}>
          {Array.from({ length: max }, (_, index) => index + 1).map((score) => (
            <button
              key={score}
              type="button"
              role="radio"
              aria-checked={current === score}
              aria-label={`Оценка ${score}`}
              onClick={() => onChange(score)}
              className="rounded p-0.5 text-warning focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Star className={cn('size-6', score <= current && 'fill-current')} aria-hidden />
            </button>
          ))}
        </div>
      );
    }
    case 'COLOR_PICKER':
      return (
        <input
          {...a11y}
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(text) ? text : '#000000'}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-16 cursor-pointer rounded-md border border-border bg-surface"
        />
      );
    case 'AGREEMENT_CHECKLIST':
      return (
        <CheckboxField
          label={field.description || 'Подтверждаю'}
          checked={value === true}
          onCheckedChange={(checked) => onChange(checked === true)}
        />
      );
    case 'DATE_RANGE': {
      const range = (value && typeof value === 'object' ? value : {}) as {
        from?: string;
        to?: string;
      };
      return (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            aria-label="С"
            value={range.from ?? ''}
            onChange={(event) => onChange({ ...range, from: event.target.value })}
            className="w-auto"
          />
          <span className="text-sm text-muted-foreground">—</span>
          <Input
            type="date"
            aria-label="По"
            value={range.to ?? ''}
            onChange={(event) => onChange({ ...range, to: event.target.value })}
            className="w-auto"
          />
        </div>
      );
    }
    case 'SERVER_SELECTOR':
      return <ServerSelect {...a11y} value={value} onChange={onChange} />;
    case 'FRIENDS_SELECTOR':
      return <FriendSelect {...a11y} value={value} onChange={onChange} />;
    case 'NEWS_REFERENCE':
      return (
        <ReferenceSelect {...a11y} path="/news" pick={itemsOf} value={value} onChange={onChange} />
      );
    case 'TOPIC_REFERENCE':
      return (
        <ReferenceSelect
          {...a11y}
          path="/topics"
          pick={itemsOf}
          value={value}
          onChange={onChange}
        />
      );
    case 'FILE_UPLOAD':
    case 'IMAGE_GALLERY':
      return (
        <p className="rounded-lg bg-surface-sunken px-3 py-2 text-sm text-muted-foreground">
          Загрузка файлов пока недоступна. Ссылки на файлы можно указать в других полях.
        </p>
      );
    default:
      return (
        <Input
          {...a11y}
          type={INPUT_TYPE[field.type] ?? 'text'}
          value={text}
          maxLength={field.maxLength ?? undefined}
          placeholder={field.placeholder ?? HINT[field.type]}
          autoComplete={field.type === 'EMAIL' ? 'email' : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      );
  }
}

export function FormFieldInput({ field, value, onChange, error }: Props) {
  if (field.type === 'STATS_DISPLAY') {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{field.label}</p>
        {field.description ? (
          <p className="text-sm text-muted-foreground">{field.description}</p>
        ) : null}
      </div>
    );
  }
  const control = <Control field={field} value={value} onChange={onChange} />;
  // Группы (радио, чекбоксы, рейтинг) и подтверждение — без связки label→input.
  const grouped = ['RADIO', 'CHECKBOX', 'RATING', 'AGREEMENT_CHECKLIST', 'DATE_RANGE'].includes(
    field.type,
  );
  return grouped || FILE_TYPES.has(field.type) ? (
    <fieldset className="flex flex-col gap-1.5" data-testid={`form-field-${field.type}`}>
      <legend className="mb-1 text-sm font-medium">
        {field.label}
        {field.isRequired ? <span className="ml-0.5 text-destructive">*</span> : null}
      </legend>
      {field.description && field.type !== 'AGREEMENT_CHECKLIST' ? (
        <p className="text-xs text-muted-foreground">{field.description}</p>
      ) : null}
      {control}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </fieldset>
  ) : (
    <Field
      label={field.label}
      required={field.isRequired}
      hint={field.description ?? undefined}
      error={error}
      data-testid={`form-field-${field.type}`}
    >
      {control}
    </Field>
  );
}
