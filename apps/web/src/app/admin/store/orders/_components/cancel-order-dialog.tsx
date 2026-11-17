'use client';

import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { FormErrorSummary, FormField, useFocusFirstInvalid } from '@/components/admin/form-field';
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
import { Textarea } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import {
  CANCEL_REASON_MAX,
  describeCancelError,
  useCancelOrder,
  validateCancelReason,
  type CancelErrorInfo,
} from '@/lib/admin/store-orders';

/// Отмена неоплаченного заказа с причиной (0.4). Обычный Dialog (Radix):
/// фокус-ловушка, Esc и крестик закрывают, фокус возвращается на кнопку,
/// открывшую окно. Начальный фокус — поле причины. Пока идёт запрос, закрытие
/// заблокировано. Оплаченный заказ API отклоняет (409) — показываем понятное
/// сообщение вместо сырого кода.
export function CancelOrderDialog({
  orderId,
  orderNumber,
  open,
  onOpenChange,
}: {
  orderId: string;
  orderNumber: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const cancel = useCancelOrder();
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [failure, setFailure] = useState<CancelErrorInfo | null>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  // Radix без Trigger не знает, куда вернуть фокус: запоминаем кнопку, открывшую окно.
  const openerRef = useRef<Element | null>(
    typeof document === 'undefined' ? null : document.activeElement,
  );
  const { containerRef, focusFirstInvalid } = useFocusFirstInvalid<HTMLFormElement>();

  const handleOpenChange = (next: boolean) => {
    if (!next && cancel.isPending) return;
    onOpenChange(next);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (cancel.isPending) return;
    setFailure(null);
    const problem = validateCancelReason(reason);
    setReasonError(problem);
    if (problem) {
      focusFirstInvalid();
      return;
    }
    cancel.mutate(
      { id: orderId, reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success(`Заказ ${orderNumber} отменён`);
          onOpenChange(false);
        },
        onError: (error) => {
          const info = describeCancelError(error);
          setFailure(info);
          if (info.reasonError) {
            setReasonError(info.reasonError);
            focusFirstInvalid();
          }
        },
      },
    );
  };

  const blocked = failure?.notCancellable === true;

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
          if (openerRef.current instanceof HTMLElement) openerRef.current.focus();
        }}
        onEscapeKeyDown={(event) => {
          if (cancel.isPending) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (cancel.isPending) event.preventDefault();
        }}
      >
        <form ref={containerRef} onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Отменить заказ {orderNumber}</DialogTitle>
            <DialogDescription>
              Отменяется только неоплаченный заказ. Причина сохраняется в заказе и в журнале аудита.
              Действие необратимо.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-3">
            {failure ? (
              <FormErrorSummary data-testid="cancel-order-error">
                {failure.message}{' '}
                {failure.needsTwoFactor ? (
                  <Link href="/settings/security" className="font-medium underline">
                    Включить 2FA
                  </Link>
                ) : null}
              </FormErrorSummary>
            ) : null}
            <FormField
              label="Причина отмены"
              required
              error={reasonError}
              hint={`До ${CANCEL_REASON_MAX} символов`}
            >
              <Textarea
                ref={reasonRef}
                rows={4}
                maxLength={CANCEL_REASON_MAX}
                value={reason}
                disabled={blocked}
                onChange={(e) => {
                  setReason(e.target.value);
                  if (reasonError) setReasonError(null);
                }}
              />
            </FormField>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={cancel.isPending}
              onClick={() => handleOpenChange(false)}
            >
              {blocked ? 'Закрыть' : 'Не отменять'}
            </Button>
            {blocked ? null : (
              <Button type="submit" variant="destructive" loading={cancel.isPending}>
                Отменить заказ
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
