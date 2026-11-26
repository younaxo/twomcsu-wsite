'use client';

import type { CreateReportRequest } from '@twomc/shared';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { RequireSession } from '@/components/auth/require-session';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input, Textarea, inputClassName } from '@/components/ui/input';
import { formatDateTime } from '@/lib/format';
import { describeSupportError } from '@/lib/support/errors';
import {
  PUNISHMENT_TYPE_LABEL,
  REPORT_TYPES,
  useMyPunishments,
  useSupportActions,
  type ReportType,
} from '@/lib/support/hooks';

/// Новое обращение по типу (Этап 01, шаг C). Поля зависят от типа:
/// жалобы — ник нарушителя (обязателен); обжалование — выбор своего наказания
/// (appealedPunishmentId, цели не нужны); донат — только описание, дата платежа
/// и e-mail (без покупок и платежей); прочие — сервер и описание.
/// Лишние поля на сервер не уходят: сервер отвечает 400 на appealedPunishmentId
/// у любого типа, кроме обжалования.
const MC_REF_PATTERN = /^(ban|mute)-[1-9][0-9]{0,17}$/;

interface FormErrors {
  target?: string;
  punishment?: string;
  description?: string;
  form?: string;
}

function ReportForm({ type }: { type: ReportType }) {
  const meta = REPORT_TYPES[type];
  const router = useRouter();
  const { create, createDonation } = useSupportActions();
  const isAppeal = meta.kind === 'appeal';
  const searchParams = useSearchParams();
  // `?mc=ban-123` — наказание сервера (l1-02): привязка без выбора из списка сайта.
  const mcRaw = searchParams.get('mc') ?? '';
  const mcRef = isAppeal && MC_REF_PATTERN.test(mcRaw) ? mcRaw : '';
  const punishments = useMyPunishments(isAppeal && !mcRef);
  const appealable = (mcRef ? [] : (punishments.data ?? [])).filter(
    (item) => item.isAppealable !== false,
  );
  const [target, setTarget] = useState('');
  // `?punishment=ID` подставляет наказание; неизвестный или необжалуемый ID игнорируется.
  const wanted = searchParams.get('punishment') ?? '';
  const [chosenId, setChosenId] = useState<string | null>(null);
  const wantedValid = appealable.some((item) => item.id === wanted);
  const punishmentId = chosenId ?? (wantedValid ? wanted : '');
  const setPunishmentId = setChosenId;
  const [server, setServer] = useState('');
  const [description, setDescription] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});

  const done = {
    onSuccess: (report: { reportNumber: string }) =>
      router.push(`/support/${encodeURIComponent(report.reportNumber)}`),
    onError: (failure: unknown) => setErrors({ form: describeSupportError(failure) }),
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next: FormErrors = {};
    if (meta.needsTarget && !target.trim()) next.target = 'Укажите ник нарушителя.';
    if (isAppeal && !mcRef && !punishmentId)
      next.punishment = 'Выберите наказание, которое обжалуете.';
    if (!description.trim()) next.description = 'Опишите, что произошло.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    const text = description.trim();
    if (meta.kind === 'donation') {
      createDonation.mutate(
        {
          description: text,
          ...(paymentDate ? { paymentDate } : {}),
          ...(email.trim() ? { contactEmail: email.trim() } : {}),
        },
        done,
      );
      return;
    }
    const body: CreateReportRequest = {
      type,
      description: text,
      // Цели нужны только жалобам; у остальных типов список пуст.
      targets: meta.needsTarget ? [{ username: target.trim() }] : [],
      ...(isAppeal && mcRef
        ? { appealedPunishmentRef: mcRef }
        : isAppeal
          ? { appealedPunishmentId: punishmentId }
          : {}),
      ...(!isAppeal && server.trim() ? { server: server.trim() } : {}),
    };
    create.mutate(body, done);
  };

  return (
    <form
      className="flex flex-col gap-4 rounded-xl bg-surface p-5 shadow-sm"
      onSubmit={submit}
      noValidate
      data-testid="report-form"
    >
      {meta.needsTarget ? (
        <Field label="Ник нарушителя" required error={errors.target}>
          <Input
            value={target}
            spellCheck={false}
            maxLength={64}
            onChange={(event) => setTarget(event.target.value)}
          />
        </Field>
      ) : null}
      {isAppeal && mcRef ? (
        <p className="text-sm" data-testid="mc-appeal-target">
          Обжалуется наказание на сервере: <span className="font-medium">{mcRef}</span>.{' '}
          <Link href="/settings/punishments" className="underline">
            История наказаний
          </Link>
        </p>
      ) : isAppeal ? (
        punishments.isPending ? (
          <p className="text-sm text-muted-foreground">Загружаем ваши наказания…</p>
        ) : punishments.isError ? (
          <p role="alert" className="text-sm text-destructive">
            Не удалось загрузить наказания: {describeSupportError(punishments.error)}
          </p>
        ) : appealable.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="no-punishments">
            У вас нет наказаний, которые можно обжаловать.{' '}
            <Link href="/settings/punishments" className="font-medium underline">
              История наказаний
            </Link>
          </p>
        ) : (
          <Field
            label="Наказание"
            required
            error={errors.punishment}
            hint={
              wanted && !wantedValid
                ? 'Наказание из ссылки не найдено или не подлежит обжалованию — выберите из списка.'
                : undefined
            }
          >
            <select
              className={inputClassName}
              value={punishmentId}
              onChange={(event) => setPunishmentId(event.target.value)}
            >
              <option value="">Выберите наказание</option>
              {appealable.map((item) => (
                <option key={item.id} value={item.id}>
                  {PUNISHMENT_TYPE_LABEL[item.punishmentType]} · {item.reason} ·{' '}
                  {formatDateTime(item.issuedAt)}
                </option>
              ))}
            </select>
          </Field>
        )
      ) : null}
      {meta.kind === 'complaint' || meta.kind === 'plain' ? (
        <Field label="Сервер" hint="Если связано с сервером">
          <Input
            value={server}
            maxLength={100}
            onChange={(event) => setServer(event.target.value)}
          />
        </Field>
      ) : null}
      {meta.kind === 'donation' ? (
        <>
          <Field label="Дата платежа" hint="Если помните">
            <Input
              type="date"
              value={paymentDate}
              onChange={(event) => setPaymentDate(event.target.value)}
            />
          </Field>
          <Field label="E-mail для связи" hint="Необязательно">
            <Input
              type="email"
              value={email}
              maxLength={254}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
        </>
      ) : null}
      <Field
        label="Описание"
        required
        error={errors.description}
        hint="До 5000 символов. Ссылки на доказательства — в тексте."
      >
        <Textarea
          value={description}
          maxLength={5000}
          rows={6}
          onChange={(event) => setDescription(event.target.value)}
        />
      </Field>
      {errors.form ? (
        <p role="alert" className="text-sm text-destructive">
          {errors.form}
        </p>
      ) : null}
      <Button
        type="submit"
        className="self-end"
        loading={create.isPending || createDonation.isPending}
        disabled={isAppeal && !mcRef && !punishments.isPending && appealable.length === 0}
      >
        Отправить обращение
      </Button>
    </form>
  );
}

export default function NewReportPage() {
  const params = useParams<{ type: string }>();
  const type = params.type.toUpperCase() as ReportType;
  const meta = Object.hasOwn(REPORT_TYPES, type) ? REPORT_TYPES[type] : undefined;
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
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-8 md:px-6">
      <PageHeader title={meta.label} description={meta.description} />
      <RequireSession>
        <Suspense>
          <ReportForm type={type} />
        </Suspense>
      </RequireSession>
    </div>
  );
}
