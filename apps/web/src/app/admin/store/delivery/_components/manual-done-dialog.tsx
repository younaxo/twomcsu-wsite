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
  DELIVERY_REASON_MAX,
  describeDeliveryError,
  useMarkManualDone,
  validateManualDoneReason,
  type DeliveryActionError,
} from '@/lib/admin/store-delivery';

/// «Отметить выданным»: причина ОБЯЗАТЕЛЬНА (попадает в аудит). Radix Dialog:
/// role="dialog", aria-modal, фокус-ловушка, Esc/крестик закрывают, фокус
/// возвращается на кнопку, открывшую окно. Начальный фокус — поле причины.
/// Пока идёт запрос, закрытие заблокировано.
export function ManualDoneDialog({
  taskId,
  title,
  open,
  onOpenChange,
  onSuccessFocus,
}: {
  taskId: string;
  /// Короткое описание задания для заголовка («Товар × 1, заказ O-1»).
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /// После успеха кнопка-открыватель может исчезнуть (статус сменился): фокус
  /// переводится на заголовок/статус карточки через этот колбэк.
  onSuccessFocus?: () => void;
}) {
  const succeededRef = useRef(false);
  const mark = useMarkManualDone();
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [failure, setFailure] = useState<DeliveryActionError | null>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const openerRef = useRef<Element | null>(
    typeof document === 'undefined' ? null : document.activeElement,
  );
  const { containerRef, focusFirstInvalid } = useFocusFirstInvalid<HTMLFormElement>();

  const handleOpenChange = (next: boolean) => {
    if (!next && mark.isPending) return;
    onOpenChange(next);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (mark.isPending) return;
    setFailure(null);
    const problem = validateManualDoneReason(reason);
    setReasonError(problem);
    if (problem) {
      focusFirstInvalid();
      return;
    }
    mark.mutate(
      { id: taskId, reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success('Выдача отмечена выполненной');
          succeededRef.current = true;
          onOpenChange(false);
        },
        onError: (error) => {
          const info = describeDeliveryError(error);
          setFailure(info);
          if (info.reasonError) {
            setReasonError(info.reasonError);
            focusFirstInvalid();
          }
        },
      },
    );
  };

  const blocked = failure?.conflict === true;

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
          if (succeededRef.current && onSuccessFocus) {
            onSuccessFocus();
            return;
          }
          if (openerRef.current instanceof HTMLElement) openerRef.current.focus();
        }}
        onEscapeKeyDown={(event) => {
          if (mark.isPending) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (mark.isPending) event.preventDefault();
        }}
      >
        <form ref={containerRef} onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Отметить выданным</DialogTitle>
            <DialogDescription>
              {title}. Вы подтверждаете, что покупка выдана игроку вручную. Причина сохраняется в
              журнале аудита.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-3">
            {failure ? (
              <FormErrorSummary data-testid="delivery-action-error">
                {failure.message}{' '}
                {failure.needsTwoFactor ? (
                  <Link href="/settings/security" className="font-medium underline">
                    Включить 2FA
                  </Link>
                ) : null}
              </FormErrorSummary>
            ) : null}
            <FormField
              label="Причина"
              required
              error={reasonError}
              hint={`Например, как и кем выдано. До ${DELIVERY_REASON_MAX} символов`}
            >
              <Textarea
                ref={reasonRef}
                rows={4}
                maxLength={DELIVERY_REASON_MAX}
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
              disabled={mark.isPending}
              onClick={() => handleOpenChange(false)}
            >
              {blocked ? 'Закрыть' : 'Отмена'}
            </Button>
            {blocked ? null : (
              <Button type="submit" loading={mark.isPending}>
                Отметить выданным
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
