'use client';

import { TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState, type FormEvent, type RefObject } from 'react';
import { FormErrorSummary, FormField, useFocusFirstInvalid } from '@/components/admin/form-field';
import { PageSection } from '@/components/admin/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import {
  OVERRIDE_CONFIRM_WORD,
  REFUND_KIND_LABEL,
  REFUND_REASON_MAX,
  REFUND_STATUS_META,
  describeRefundError,
  describeRefundResult,
  isRefundsDisabled,
  remainingToRefund,
  useOrderRefunds,
  useRefundAction,
  validateRefundForm,
  type AdminRefund,
  type RefundAction,
  type RefundErrorInfo,
  type RefundFormErrors,
} from '@/lib/admin/store-refunds';
import type { AdminOrderCard } from '@/lib/admin/store-orders';
import { usePermissions } from '@/lib/auth/use-permissions';
import { formatDateTime, formatMoney } from '@/lib/format';

/// Блок «Возврат» карточки заказа (0.9, ADR-0188). Виден только с правом
/// `orders.refund`. Если API отвечает 503 `refunds_disabled` — «Возвраты
/// выключены», кнопки неактивны. Каждое действие требует причину и свежий код
/// 2FA; «Возврат по ошибке» (после выдачи) — ещё право `store.refund.override`,
/// предупреждение и подтверждение вводом слова.

const REFUNDABLE: readonly string[] = ['COMPLETED', 'REFUND_FAILED'];
const SHOWN_STATUSES: readonly string[] = [
  'COMPLETED',
  'REFUND_FAILED',
  'REFUND_PENDING',
  'REFUNDED',
];

const ACTION_TEXT: Record<
  RefundAction,
  { title: string; submit: string; description: string; reasonLabel: string }
> = {
  refund: {
    title: 'Вернуть средства',
    submit: 'Вернуть',
    description:
      'Деньги вернутся на исходный способ оплаты через платёжного провайдера. Возврат возможен только до выдачи товара.',
    reasonLabel: 'Причина возврата',
  },
  override: {
    title: 'Возврат по ошибке после выдачи',
    submit: 'Выполнить возврат по ошибке',
    description: 'Исключительная операция для случаев, когда товар уже выдан.',
    reasonLabel: 'Причина возврата по ошибке',
  },
  'mark-failed': {
    title: 'Отметить возврат неудавшимся',
    submit: 'Отметить неудавшимся',
    description:
      'Используйте, если провайдер так и не ответил по зависшему возврату. После этого можно повторить возврат. Проверьте у провайдера, что деньги не ушли.',
    reasonLabel: 'Причина',
  },
};

function RefundDialog({
  action,
  order,
  remaining,
  open,
  onOpenChange,
  onDone,
  fallbackFocusRef,
}: {
  action: RefundAction;
  order: AdminOrderCard;
  remaining: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: (message: string) => void;
  /// Куда вернуть фокус, если инициатор размонтирован или неактивен.
  fallbackFocusRef: RefObject<HTMLElement | null>;
}) {
  const mutation = useRefundAction(action);
  const text = ACTION_TEXT[action];
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState(remaining);
  const [code, setCode] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [errors, setErrors] = useState<RefundFormErrors>({});
  const [failure, setFailure] = useState<RefundErrorInfo | null>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const openerRef = useRef<Element | null>(
    typeof document === 'undefined' ? null : document.activeElement,
  );
  const { containerRef, focusFirstInvalid } = useFocusFirstInvalid<HTMLFormElement>();
  const withAmount = action !== 'mark-failed';
  const requireConfirm = action === 'override';

  const handleOpenChange = (next: boolean) => {
    if (!next && mutation.isPending) return;
    onOpenChange(next);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (mutation.isPending) return;
    setFailure(null);
    const problems = validateRefundForm(
      { reason, amount, twoFactorCode: code, confirmText },
      { withAmount, requireConfirm, remaining },
    );
    setErrors(problems);
    if (Object.keys(problems).length > 0) {
      focusFirstInvalid();
      return;
    }
    const trimmedAmount = amount.trim();
    mutation.mutate(
      {
        orderId: order.id,
        body: {
          reason: reason.trim(),
          twoFactorCode: code.trim(),
          ...(withAmount && trimmedAmount ? { amount: trimmedAmount } : {}),
        },
      },
      {
        onSuccess: (result) => {
          onDone(describeRefundResult(action, result));
          onOpenChange(false);
        },
        onError: (error) => {
          const info = describeRefundError(error);
          setFailure(info);
          // Код 2FA одноразовый: после любой ошибки просим ввести новый.
          setCode('');
          if (info.field) {
            setErrors({ [info.field]: info.message });
            focusFirstInvalid();
          }
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        size="sm"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          reasonRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const opener = openerRef.current;
          if (
            opener instanceof HTMLElement &&
            opener.isConnected &&
            !opener.hasAttribute('disabled')
          ) {
            opener.focus();
          } else {
            fallbackFocusRef.current?.focus();
          }
        }}
        onEscapeKeyDown={(event) => {
          if (mutation.isPending) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (mutation.isPending) event.preventDefault();
        }}
      >
        <form ref={containerRef} onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>
              {text.title}: заказ {order.orderNumber}
            </DialogTitle>
            <DialogDescription>{text.description}</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-3">
            {action === 'override' ? (
              <div
                role="note"
                data-testid="override-warning"
                className="flex gap-2 rounded-lg bg-warning-soft p-3 text-sm text-warning"
              >
                <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                <p>
                  Действие необратимо. Игровую выдачу система не отзывает: привилегии и предметы
                  нужно отозвать вручную на сервере. Операция попадает в журнал аудита как
                  критическая.
                </p>
              </div>
            ) : null}
            {failure ? (
              <FormErrorSummary data-testid="refund-error">
                {failure.message}{' '}
                {failure.needsTwoFactorSetup ? (
                  <Link href="/settings/security" className="font-medium underline">
                    Включить 2FA
                  </Link>
                ) : null}
              </FormErrorSummary>
            ) : null}
            {withAmount ? (
              <FormField
                label="Сумма возврата, ₽"
                error={errors.amount}
                hint={`Остаток к возврату: ${formatMoney(remaining)} (с учётом обрабатываемых возвратов). Пусто — вернуть остаток.`}
              >
                <Input
                  inputMode="decimal"
                  autoComplete="off"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    if (errors.amount) setErrors({ ...errors, amount: undefined });
                  }}
                />
              </FormField>
            ) : null}
            <FormField
              label={text.reasonLabel}
              required
              error={errors.reason}
              hint={`До ${REFUND_REASON_MAX} символов, сохраняется в аудите`}
            >
              <Textarea
                ref={reasonRef}
                rows={3}
                maxLength={REFUND_REASON_MAX}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  if (errors.reason) setErrors({ ...errors, reason: undefined });
                }}
              />
            </FormField>
            <FormField
              label="Код 2FA"
              required
              error={errors.twoFactorCode}
              hint="Свежий код из приложения-аутентификатора. Резервные коды не подходят."
            >
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\s/g, ''));
                  if (errors.twoFactorCode) setErrors({ ...errors, twoFactorCode: undefined });
                }}
              />
            </FormField>
            {requireConfirm ? (
              <FormField
                label={`Для подтверждения введите ${OVERRIDE_CONFIRM_WORD}`}
                required
                error={errors.confirmText}
              >
                <Input
                  autoComplete="off"
                  spellCheck={false}
                  value={confirmText}
                  onChange={(e) => {
                    setConfirmText(e.target.value);
                    if (errors.confirmText) setErrors({ ...errors, confirmText: undefined });
                  }}
                />
              </FormField>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={mutation.isPending}
              onClick={() => handleOpenChange(false)}
            >
              Отмена
            </Button>
            <Button
              type="submit"
              variant={action === 'refund' ? 'primary' : 'destructive'}
              loading={mutation.isPending}
              disabled={failure?.disabled === true}
            >
              {text.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function HistoryRow({ refund }: { refund: AdminRefund }) {
  const meta = REFUND_STATUS_META[refund.status];
  return (
    <li className="flex flex-col gap-1 rounded-lg bg-muted p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <strong>{formatMoney(refund.amount)}</strong>
        <Badge tone={meta.tone}>{meta.label}</Badge>
        <span className="text-xs text-muted-foreground">{REFUND_KIND_LABEL[refund.kind]}</span>
        <span className="text-xs text-muted-foreground">{formatDateTime(refund.createdAt)}</span>
      </div>
      <p className="text-muted-foreground">{refund.reason}</p>
      {refund.requiresManualRevoke ? (
        <p className="text-xs text-warning">Выданное в игре нужно отозвать вручную.</p>
      ) : null}
    </li>
  );
}

export function OrderRefundPanel({ order }: { order: AdminOrderCard }) {
  const { can } = usePermissions();
  const allowed = can('orders.refund') && SHOWN_STATUSES.includes(order.status);
  const refunds = useOrderRefunds(order.id, allowed);
  const [dialog, setDialog] = useState<RefundAction | null>(null);
  const [result, setResult] = useState('');
  const headingRef = useRef<HTMLSpanElement>(null);

  if (!allowed) return null;

  const disabled = isRefundsDisabled(refunds.error);
  const history = refunds.data?.items ?? [];
  const remaining = remainingToRefund(order.total, history);
  const delivered = order.items.some((line) => line.isDelivered);
  const canRefund = REFUNDABLE.includes(order.status);
  const canOverride = canRefund && can('store.refund.override');
  const loading = refunds.isPending;
  const otherError = refunds.isError && !disabled;

  return (
    <PageSection
      title={
        <span ref={headingRef} tabIndex={-1} className="outline-none focus-visible:underline">
          Возврат
        </span>
      }
    >
      <div
        className="flex flex-col gap-3 rounded-xl bg-surface p-5 shadow-sm"
        data-testid="refund-panel"
      >
        {disabled ? (
          <p className="text-sm text-muted-foreground" data-testid="refunds-disabled">
            Возвраты выключены. Действия недоступны, пока флаг не включён на сервере.
          </p>
        ) : null}
        {otherError ? (
          <p className="text-sm text-destructive" role="alert">
            Не удалось загрузить возвраты заказа.{' '}
            <button type="button" className="underline" onClick={() => refunds.refetch()}>
              Повторить
            </button>
          </p>
        ) : null}
        {!disabled && !loading && !otherError ? (
          <p className="text-sm text-muted-foreground">
            Остаток к возврату: <strong>{formatMoney(remaining)}</strong>
          </p>
        ) : null}
        {canRefund && delivered ? (
          <p className="text-sm text-muted-foreground">
            Товар уже выдан: обычный возврат недоступен.
            {canOverride ? '' : ' Возврат по ошибке требует отдельного права.'}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {canRefund ? (
            <Button
              variant="secondary"
              disabled={disabled || loading || otherError || delivered}
              onClick={() => setDialog('refund')}
            >
              Вернуть
            </Button>
          ) : null}
          {canOverride ? (
            <Button
              variant="destructive"
              disabled={disabled || loading || otherError}
              onClick={() => setDialog('override')}
            >
              Возврат по ошибке
            </Button>
          ) : null}
          {order.status === 'REFUND_PENDING' ? (
            <Button
              variant="secondary"
              disabled={disabled || loading || otherError}
              onClick={() => setDialog('mark-failed')}
            >
              Отметить возврат неудавшимся
            </Button>
          ) : null}
        </div>
        <div role="status" aria-live="polite" data-testid="refund-result" className="text-sm">
          {result}
        </div>
        {history.length > 0 ? (
          <ul aria-label="История возвратов заказа" className="flex flex-col gap-2">
            {history.map((refund) => (
              <HistoryRow key={refund.id} refund={refund} />
            ))}
          </ul>
        ) : null}
      </div>
      {dialog ? (
        <RefundDialog
          action={dialog}
          order={order}
          remaining={remaining}
          open
          onOpenChange={(next) => {
            if (!next) setDialog(null);
          }}
          onDone={setResult}
          fallbackFocusRef={headingRef}
        />
      ) : null}
    </PageSection>
  );
}
