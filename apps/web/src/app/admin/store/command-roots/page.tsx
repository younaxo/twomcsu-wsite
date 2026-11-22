'use client';

import { ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { FormErrorSummary, FormField as Field } from '@/components/admin/form-field';
import { PageHeader } from '@/components/admin/page-header';
import { PermissionGate } from '@/components/admin/permission-gate';
import { QueryBoundary } from '@/components/admin/query-boundary';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import {
  TWO_FACTOR_MAX,
  describeTemplateError,
  parseRootsInput,
  useCommandRoots,
  useSaveRoots,
  validateRootsClient,
  validateTwoFactorCode,
  type CommandRoots,
  type TemplateErrorInfo,
} from '@/lib/admin/store-delivery-templates';

/// «Корни команд» (0.11, ADR-0189): просмотр белого списка первых слов команд
/// выдачи и расширение списка. Право `store.delivery.templates.manage`, запись —
/// со свежим кодом 2FA. Запрещённые корни расширением не разрешаются.

function RootBadges({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Список">
      {items.map((root) => (
        <li key={root}>
          <Badge tone="neutral">
            <code>{root}</code>
          </Badge>
        </li>
      ))}
    </ul>
  );
}

function RootsEditor({ data }: { data: CommandRoots }) {
  const save = useSaveRoots();
  const [text, setText] = useState(data.extra.join(', '));
  const [code, setCode] = useState('');
  const [rootsError, setRootsError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [failure, setFailure] = useState<TemplateErrorInfo | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const extraKey = data.extra.join(',');
  useEffect(() => {
    setText(extraKey.split(',').filter(Boolean).join(', '));
  }, [extraKey]);

  const submit = () => {
    setFailure(null);
    const roots = parseRootsInput(text);
    const rootsProblem = validateRootsClient(roots, data.forbidden);
    setRootsError(rootsProblem);
    const codeProblem = validateTwoFactorCode(code);
    setCodeError(codeProblem);
    if (rootsProblem) return;
    if (codeProblem) {
      codeRef.current?.focus();
      return;
    }
    save.mutate(
      { roots, twoFactorCode: code.trim() },
      {
        onSuccess: () => {
          setCode('');
          toast.success('Список корней сохранён');
        },
        onError: (error) => {
          const info = describeTemplateError(error);
          setFailure(info);
          setCode('');
          if (info.twoFactorProblem) codeRef.current?.focus();
        },
      },
    );
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
      {failure ? (
        <FormErrorSummary data-testid="roots-error">
          {failure.message}{' '}
          {failure.needsTwoFactorSetup ? (
            <Link href="/settings/security" className="font-medium underline">
              Включить 2FA
            </Link>
          ) : null}
        </FormErrorSummary>
      ) : null}
      <Field
        label="Дополнительные корни"
        error={rootsError}
        hint="Через запятую или пробел: латиница в нижнем регистре, цифры, _ и -. Не более 30. Пустое поле — без расширения."
      >
        <Textarea
          rows={3}
          spellCheck={false}
          autoComplete="off"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </Field>
      <Field
        label="Код 2FA"
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
        />
      </Field>
      <div>
        <Button type="submit" loading={save.isPending}>
          Сохранить список
        </Button>
      </div>
    </form>
  );
}

function CommandRootsContent() {
  const roots = useCommandRoots();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Корни команд"
        description="Первое слово команды выдачи, которое разрешено в шаблонах."
        breadcrumbs={[{ label: 'Магазин' }, { label: 'Корни команд' }]}
      />
      <QueryBoundary query={roots}>
        {(data) => (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="flex flex-col gap-3">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <ShieldCheck aria-hidden className="size-4 text-primary" />
                Разрешены по умолчанию
              </h2>
              <RootBadges items={data.defaults} empty="Список пуст." />
              <h2 className="pt-2 text-base font-semibold">Запрещены всегда</h2>
              <p className="text-xs text-muted-foreground">
                Опасные и служебные команды нельзя разрешить расширением списка.
              </p>
              <RootBadges items={data.forbidden} empty="Список пуст." />
              <h2 className="pt-2 text-base font-semibold">Добавлены дополнительно</h2>
              <RootBadges items={data.extra} empty="Дополнительных корней нет." />
            </Card>
            <Card className="flex flex-col gap-3">
              <h2 className="text-base font-semibold">Расширить список</h2>
              <RootsEditor data={data} />
            </Card>
          </div>
        )}
      </QueryBoundary>
    </div>
  );
}

export default function CommandRootsPage() {
  return (
    <PermissionGate
      requirement="store.delivery.templates.manage"
      title="Корни команд недоступны"
      description="Нужно право «Шаблоны команд выдачи»."
    >
      <CommandRootsContent />
    </PermissionGate>
  );
}
