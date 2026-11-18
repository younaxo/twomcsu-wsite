'use client';

import Link from 'next/link';
import { useId, useRef, useState, type FormEvent } from 'react';
import { FormErrorSummary, FormField, useFocusFirstInvalid } from '@/components/admin/form-field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
  useRetryDelivery,
  validateRetryReason,
  type DeliveryActionError,
} from '@/lib/admin/store-delivery';

/// «Повторить» выдачу: требует явного подтверждения (чекбокс), потому что
/// команда на сервер могла уже выполниться, и повтор способен выдать дважды.
/// Причина необязательна. Доступность и фокус — как у ManualDoneDialog.
export function RetryDialog({
  taskId,
  title,
  open,
  onOpenChange,
}: {
  taskId: string;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const retry = useRetryDelivery();
  const [confirmed, setConfirmed] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [failure, setFailure] = useState<DeliveryActionError | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const confirmId = useId();
  const openerRef = useRef<Element | null>(
    typeof document === 'undefined' ? null : document.activeElement,
  );
  const { containerRef, focusFirstInvalid } = useFocusFirstInvalid<HTMLFormElement>();

  const handleOpenChange = (next: boolean) => {
    if (!next && retry.isPending) return;
    onOpenChange(next);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (retry.isPending) return;
    setFailure(null);
    const reasonProblem = validateRetryReason(reason);
    const confirmProblem = confirmed ? null : 'Подтвердите, что понимаете риск повторной выдачи';
    setReasonError(reasonProblem);
    setConfirmError(confirmProblem);
    if (reasonProblem || confirmProblem) {
      focusFirstInvalid();
      return;
    }
    retry.mutate(
      { id: taskId, reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success('Выдача поставлена на повтор');
          onOpenChange(false);
        },
        onError: (error) => setFailure(describeDeliveryError(error)),
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
          confirmRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (openerRef.current instanceof HTMLElement) openerRef.current.focus();
        }}
        onEscapeKeyDown={(event) => {
          if (retry.isPending) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (retry.isPending) event.preventDefault();
        }}
      >
        <form ref={containerRef} onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Повторить выдачу</DialogTitle>
            <DialogDescription>
              {title}. Задание вернётся в очередь. Предыдущая попытка могла уже сработать на
              сервере, тогда игрок получит покупку дважды.
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
            <div className="flex flex-col gap-1.5">
              <div className="flex items-start gap-2">
                <Checkbox
                  id={confirmId}
                  ref={confirmRef}
                  checked={confirmed}
                  disabled={blocked}
                  invalid={Boolean(confirmError)}
                  aria-describedby={confirmError ? `${confirmId}-error` : undefined}
                  onCheckedChange={(value) => {
                    setConfirmed(value === true);
                    if (value === true) setConfirmError(null);
                  }}
                  className="mt-0.5"
                />
                <label htmlFor={confirmId} className="text-sm leading-snug">
                  Понимаю, что команда могла уже выполниться, и подтверждаю повтор
                </label>
              </div>
              {confirmError ? (
                <p id={`${confirmId}-error`} className="text-xs text-destructive">
                  {confirmError}
                </p>
              ) : null}
            </div>
            <FormField
              label="Причина (необязательно)"
              error={reasonError}
              hint={`До ${DELIVERY_REASON_MAX} символов`}
            >
              <Textarea
                rows={3}
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
              disabled={retry.isPending}
              onClick={() => handleOpenChange(false)}
            >
              {blocked ? 'Закрыть' : 'Отмена'}
            </Button>
            {blocked ? null : (
              <Button type="submit" loading={retry.isPending}>
                Повторить выдачу
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
