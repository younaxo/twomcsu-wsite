'use client';

import { CircleCheck } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Turnstile, type TurnstileHandle } from '@/components/auth/turnstile';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { SafeMarkdown } from '@/components/ui/safe-markdown';
import { toast } from '@/components/ui/toast';
import { getErrorMessage } from '@/lib/api/errors';
import { useAuthStore } from '@/lib/auth/store';
import { TURNSTILE_SITE_KEY } from '@/lib/env';
import { formatDateTime } from '@/lib/format';
import {
  answerValue,
  useFormActions,
  useFormAutofill,
  useMyFormResponses,
  type FormDto,
  type FormFieldDto,
  type FormValues,
} from '@/lib/forms/hooks';
import { FILE_TYPES, FormFieldInput } from './form-field-input';

/// Заполнение формы (срез 3.6, ADR-0122): шаги, черновик (для вошедших),
/// автозаполнение email, капча, сроки и лимиты — понятными состояниями.
/// `customCss` формы не применяется: стиль сайта един (дизайн-система).

const TEXT_DEFAULT_TYPES = new Set([
  'TEXT',
  'TEXTAREA',
  'EMAIL',
  'PHONE',
  'URL',
  'SELECT',
  'RADIO',
]);

function isEmpty(field: FormFieldDto, value: unknown): boolean {
  if (field.type === 'AGREEMENT_CHECKLIST') return value !== true;
  if (field.type === 'DATE_RANGE') {
    const range = (value ?? {}) as { from?: string; to?: string };
    return !range.from || !range.to;
  }
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}

const safeRedirect = (url: string | null) =>
  url && /^https?:\/\//i.test(url)
    ? url
    : url?.startsWith('/') && !url.startsWith('//')
      ? url
      : null;

export function FormFiller({ form, inviteCode }: { form: FormDto; inviteCode?: string }) {
  const user = useAuthStore((state) => (state.status === 'authenticated' ? state.user : null));
  const mine = useMyFormResponses(!!user);
  const autofill = useFormAutofill(!!user);
  const { submit, saveDraft } = useFormActions(form.slug);
  const [values, setValues] = useState<FormValues>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const turnstileRef = useRef<TurnstileHandle>(null);
  const initialized = useRef(false);

  const fields = useMemo(() => [...form.fields].sort((a, b) => a.order - b.order), [form.fields]);
  const steps = useMemo(() => {
    if (!form.multiStep) return [fields];
    const indexes = [...new Set(fields.map((field) => field.stepIndex ?? 0))].sort((a, b) => a - b);
    return indexes.map((index) => fields.filter((field) => (field.stepIndex ?? 0) === index));
  }, [fields, form.multiStep]);
  const draft = mine.data?.find((response) => response.formId === form.id && !response.isComplete);
  const alreadyDone =
    form.onePerUser &&
    !!mine.data?.some((response) => response.formId === form.id && response.isComplete);

  // Начальные значения — один раз, когда известны черновик и автозаполнение.
  const loading = !!user && (mine.isPending || autofill.isPending);
  useEffect(() => {
    if (initialized.current || loading) return;
    initialized.current = true;
    const initial: FormValues = {};
    for (const field of fields) {
      if (field.defaultValue && TEXT_DEFAULT_TYPES.has(field.type)) {
        initial[field.id] = field.defaultValue;
      }
      if (field.type === 'EMAIL' && autofill.data?.email) initial[field.id] = autofill.data.email;
    }
    for (const answer of draft?.answers ?? []) {
      const value = answerValue(answer);
      if (value !== undefined) initial[answer.fieldId] = value;
    }
    setValues(initial);
    if (draft?.currentStep) setStep(Math.min(draft.currentStep, steps.length - 1));
  }, [loading, fields, draft, autofill.data, steps.length]);

  const now = Date.now();
  const blocked =
    !user && form.requiresAuth
      ? 'Войдите, чтобы заполнить эту форму.'
      : form.opensAt && Date.parse(form.opensAt) > now
        ? `Форма откроется ${formatDateTime(form.opensAt)}.`
        : form.closesAt && Date.parse(form.closesAt) < now
          ? 'Приём ответов на форму закрыт.'
          : form.maxResponses !== null && form.responsesCount >= form.maxResponses
            ? 'Достигнут лимит ответов на форму.'
            : alreadyDone
              ? 'Вы уже отправили ответ на эту форму.'
              : null;
  const needsFiles = fields.some((field) => field.isRequired && FILE_TYPES.has(field.type));

  const validate = (list: FormFieldDto[]) => {
    const next: Record<string, string> = {};
    for (const field of list) {
      if (field.type === 'STATS_DISPLAY' || FILE_TYPES.has(field.type)) continue;
      if (field.isRequired && isEmpty(field, values[field.id])) {
        next[field.id] = 'Обязательное поле';
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const last = step >= steps.length - 1;
  const captchaRequired = form.requiresCaptcha && !!TURNSTILE_SITE_KEY;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!validate(steps[step] ?? [])) return;
    if (!last) {
      setStep(step + 1);
      return;
    }
    if (!validate(fields)) return;
    setFormError(null);
    submit.mutate(
      { values, captchaToken: captchaToken ?? undefined, inviteCode },
      {
        onSuccess: () => setDone(true),
        onError: (error) => {
          setFormError(getErrorMessage(error));
          turnstileRef.current?.reset();
          setCaptchaToken(null);
        },
      },
    );
  };

  if (done) {
    const redirect = safeRedirect(form.redirectUrl);
    return (
      <EmptyState
        icon={<CircleCheck />}
        title="Ответ отправлен"
        description={form.thankYouMessage || 'Спасибо! Администрация получила ваш ответ.'}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            {redirect ? (
              <Button asChild>
                <a href={redirect} rel="noopener noreferrer">
                  Продолжить
                </a>
              </Button>
            ) : null}
            <Button asChild variant="secondary">
              <Link href="/forms">Все формы</Link>
            </Button>
          </div>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="form-filler">
      {form.description ? <SafeMarkdown source={form.description} className="text-sm" /> : null}
      {blocked ? (
        <p className="rounded-xl bg-surface-sunken px-4 py-3 text-sm" data-testid="form-blocked">
          {blocked}{' '}
          {!user && form.requiresAuth ? (
            <Link
              href={`/login?next=${encodeURIComponent(
                inviteCode ? `/forms/invite/${inviteCode}` : `/forms/${form.slug}`,
              )}`}
              className="font-medium text-primary hover:underline"
            >
              Войти
            </Link>
          ) : null}
        </p>
      ) : loading ? null : (
        <form
          className="flex flex-col gap-5 rounded-xl bg-surface p-5 shadow-sm"
          onSubmit={onSubmit}
          noValidate
        >
          {steps.length > 1 ? (
            <p className="text-xs text-muted-foreground" data-testid="form-step">
              Шаг {step + 1} из {steps.length}
            </p>
          ) : null}
          {(steps[step] ?? []).map((field) => (
            <FormFieldInput
              key={field.id}
              field={field}
              value={values[field.id]}
              error={errors[field.id]}
              onChange={(value) => setValues((current) => ({ ...current, [field.id]: value }))}
            />
          ))}
          {needsFiles && last ? (
            <p className="text-sm text-destructive">
              Форма требует загрузки файлов — отправить её пока нельзя.
            </p>
          ) : null}
          {captchaRequired && last ? (
            <Turnstile ref={turnstileRef} action="form" onToken={setCaptchaToken} />
          ) : null}
          {formError ? (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {step > 0 ? (
              <Button type="button" variant="ghost" onClick={() => setStep(step - 1)}>
                Назад
              </Button>
            ) : null}
            {user ? (
              <Button
                type="button"
                variant="secondary"
                loading={saveDraft.isPending}
                onClick={() =>
                  saveDraft.mutate(
                    { values, currentStep: step, inviteCode },
                    {
                      onSuccess: () => toast.success('Черновик сохранён'),
                      onError: (error) => toast.error(getErrorMessage(error)),
                    },
                  )
                }
              >
                Сохранить черновик
              </Button>
            ) : null}
            <Button
              type="submit"
              loading={submit.isPending}
              disabled={last && (needsFiles || (captchaRequired && !captchaToken))}
            >
              {last ? 'Отправить' : 'Далее'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
