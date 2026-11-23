'use client';

import { Terminal } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { FormErrorSummary, FormField as Field } from '@/components/admin/form-field';
import { Button } from '@/components/ui/button';
import { Input, Textarea, inputClassName } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import {
  PREVIEW_DEFAULT_USERNAME,
  TEMPLATE_MAX_LENGTH,
  TWO_FACTOR_MAX,
  describeTemplateError,
  usePreviewTemplate,
  useCommandRoots,
  useDeliveryTemplates,
  useSaveTemplate,
  validateTemplateClient,
  validateTwoFactorCode,
  type TemplateErrorInfo,
} from '@/lib/admin/store-delivery-templates';
import type { AdminProduct } from '@/lib/admin/store-products';
import { DURATION_LABEL, durationLabel, type ProductDuration } from '@/lib/store/catalog';

const WHOLE_PRODUCT = '*';

/// Блок «Команда выдачи» в карточке товара (0.11, ADR-0189). Показывается только
/// при праве `store.delivery.templates.manage` (решение принимает родитель).
/// Блок стоит внутри формы товара, поэтому кнопки — type="button", а Enter в
/// полях не отправляет форму товара. Команда никуда не отправляется:
/// «Предпросмотр» только подставляет значения, сохранение требует код 2FA.
export function DeliveryTemplateBlock({ product }: { product: AdminProduct }) {
  const uid = useId();
  const roots = useCommandRoots();
  const templates = useDeliveryTemplates(product.id);
  const preview = usePreviewTemplate();
  const save = useSaveTemplate();

  const [scope, setScope] = useState<string>(WHOLE_PRODUCT);
  const [template, setTemplate] = useState('');
  const [username, setUsername] = useState(PREVIEW_DEFAULT_USERNAME);
  const [duration, setDuration] = useState<string>(product.variants[0]?.duration ?? 'FOREVER');
  const [code, setCode] = useState('');
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [failure, setFailure] = useState<TemplateErrorInfo | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  const saved = templates.data?.find((t) =>
    scope === WHOLE_PRODUCT ? t.variantId === null : t.variantId === scope,
  );
  const savedTemplate = saved?.template;
  // При смене области/загрузке подставляем сохранённый шаблон.
  useEffect(() => {
    setTemplate(savedTemplate ?? '');
    setTemplateError(null);
    setResult(null);
    setFailure(null);
  }, [scope, savedTemplate]);

  // Срок для предпросмотра следует за выбранным вариантом.
  useEffect(() => {
    const variant = product.variants.find((v) => v.id === scope);
    if (variant?.duration) setDuration(variant.duration);
  }, [scope, product.variants]);

  const allowedRoots = [...(roots.data?.defaults ?? []), ...(roots.data?.extra ?? [])];
  const forbiddenRoots = roots.data?.forbidden ?? [];

  const checkTemplate = (): boolean => {
    const problem = validateTemplateClient(template, allowedRoots, forbiddenRoots);
    setTemplateError(problem);
    return problem === null;
  };

  const onPreview = () => {
    setFailure(null);
    setResult(null);
    if (!checkTemplate()) return;
    preview.mutate(
      { template: template.trim(), username: username.trim(), duration },
      {
        onSuccess: (data) => setResult(data.command),
        onError: (error) => setFailure(describeTemplateError(error)),
      },
    );
  };

  const onSave = () => {
    setFailure(null);
    if (!checkTemplate()) return;
    const codeProblem = validateTwoFactorCode(code);
    setCodeError(codeProblem);
    if (codeProblem) {
      codeRef.current?.focus();
      return;
    }
    save.mutate(
      {
        productId: product.id,
        variantId: scope === WHOLE_PRODUCT ? undefined : scope,
        template: template.trim(),
        twoFactorCode: code.trim(),
      },
      {
        onSuccess: () => {
          setCode('');
          setCodeError(null);
          toast.success('Шаблон команды сохранён');
        },
        onError: (error) => {
          const info = describeTemplateError(error);
          setFailure(info);
          // Код одноразовый: после любой ошибки поле очищается.
          setCode('');
          if (info.twoFactorProblem) codeRef.current?.focus();
        },
      },
    );
  };

  const stopEnter = (event: KeyboardEvent) => {
    if (event.key === 'Enter') event.preventDefault();
  };

  const durations = Object.keys(DURATION_LABEL) as ProductDuration[];
  const variantScope = scope !== WHOLE_PRODUCT;

  return (
    <section
      role="group"
      aria-labelledby={`${uid}-title`}
      className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-surface-sunken p-3"
      data-testid="delivery-template-block"
    >
      <div className="flex items-center gap-2">
        <Terminal aria-hidden className="size-4 text-primary" />
        <h3 id={`${uid}-title`} className="text-sm font-semibold">
          Команда выдачи
        </h3>
      </div>
      <p className="text-xs leading-snug text-muted-foreground">
        Команда, которая уйдёт на игровой сервер при выдаче. Шаблон варианта важнее шаблона всего
        товара. Допустимые переменные: <code className="rounded bg-muted px-1">{'{username}'}</code>{' '}
        (обязательна, ник игрока) и <code className="rounded bg-muted px-1">{'{duration}'}</code>{' '}
        (срок: forever, 90d, 30d, 7d, season, once). Разрешённые корни (первое слово):{' '}
        <span data-testid="template-roots">
          {roots.isPending
            ? 'загрузка…'
            : roots.isError
              ? 'не удалось загрузить, проверит сервер'
              : allowedRoots.join(', ')}
        </span>
        . Список расширяется в разделе{' '}
        <Link href="/admin/store/command-roots" className="font-medium underline">
          «Корни команд»
        </Link>
        .
      </p>

      {failure ? (
        <FormErrorSummary data-testid="template-error">
          {failure.message}{' '}
          {failure.needsTwoFactorSetup ? (
            <Link href="/settings/security" className="font-medium underline">
              Включить 2FA
            </Link>
          ) : null}
        </FormErrorSummary>
      ) : null}

      <Field label="Область действия">
        <select
          className={inputClassName}
          value={scope}
          onChange={(event) => setScope(event.target.value)}
        >
          <option value={WHOLE_PRODUCT}>Весь товар</option>
          {product.variants.map((variant) => (
            <option key={variant.id} value={variant.id}>
              {`Вариант: ${durationLabel(variant.duration)}`}
            </option>
          ))}
        </select>
      </Field>

      {templates.isError ? (
        <p role="alert" className="text-xs text-destructive">
          Не удалось загрузить сохранённый шаблон. Обновите страницу.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground" data-testid="template-saved-state">
          {templates.isPending
            ? 'Загрузка шаблона…'
            : saved
              ? `Сохранён шаблон, версия ${saved.version}.`
              : variantScope
                ? 'Для этого варианта шаблона нет: действует шаблон товара.'
                : 'Шаблон не задан: выдача идёт вручную.'}
        </p>
      )}

      <Field
        label="Шаблон команды"
        required
        error={templateError}
        hint={`Без «/» в начале, до ${TEMPLATE_MAX_LENGTH} символов. Пример: lp user {username} parent add vip`}
      >
        <Textarea
          rows={2}
          maxLength={1000}
          spellCheck={false}
          autoComplete="off"
          value={template}
          onChange={(event) => setTemplate(event.target.value)}
          onKeyDown={stopEnter}
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Тестовый ник для предпросмотра">
          <Input
            value={username}
            maxLength={64}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => setUsername(event.target.value)}
            onKeyDown={stopEnter}
          />
        </Field>
        <Field label="Срок для предпросмотра">
          <select
            className={inputClassName}
            value={duration}
            onChange={(event) => setDuration(event.target.value)}
          >
            {durations.map((value) => (
              <option key={value} value={value}>
                {DURATION_LABEL[value]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={preview.isPending}
          onClick={onPreview}
        >
          Предпросмотр
        </Button>
        <span className="text-xs text-muted-foreground">
          Только подстановка: команда не отправляется и шаблон не сохраняется.
        </span>
      </div>
      {result !== null ? (
        <p className="text-sm" data-testid="template-preview-result">
          Итоговая команда:{' '}
          <code className="break-all rounded bg-muted px-1.5 py-0.5">{result}</code>
        </p>
      ) : null}

      <Field
        label="Код 2FA для сохранения"
        required
        error={codeError}
        hint="Свежий код из приложения-аутентификатора (резервные коды не подходят)."
      >
        <Input
          ref={codeRef}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={TWO_FACTOR_MAX}
          spellCheck={false}
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onSave();
            }
          }}
        />
      </Field>
      <div>
        <Button type="button" size="sm" loading={save.isPending} onClick={onSave}>
          Сохранить шаблон
        </Button>
      </div>
    </section>
  );
}
