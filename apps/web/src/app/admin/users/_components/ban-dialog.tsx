'use client';

import type { BulkUserAction } from '@twomc/shared';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { useBulkUsers } from '@/lib/admin/hooks';
import { getErrorMessage } from '@/lib/api/errors';
import { formatNumber, plural } from '@/lib/format';

export interface BanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: BulkUserAction;
  userIds: string[];
  /// Подпись цели: ник или «N пользователей».
  label?: string;
  onDone?: () => void;
}

/// Бан/разбан одного или нескольких пользователей через bulk-эндпоинт
/// (`users.bulk.edit`). Причина обязательна для бана; срок пуст — навсегда.
export function BanDialog({ open, onOpenChange, action, userIds, label, onDone }: BanDialogProps) {
  const [reason, setReason] = useState('');
  const [hours, setHours] = useState('');
  const mutation = useBulkUsers();
  const count = userIds.length;
  const target =
    label ??
    `${formatNumber(count)} ${plural(count, { one: 'пользователя', few: 'пользователей', many: 'пользователей' })}`;
  const isBan = action === 'BAN';

  const confirm = async () => {
    try {
      const durationHours = hours.trim() === '' ? undefined : Number(hours);
      const result = await mutation.mutateAsync({
        userIds,
        action,
        reason: reason.trim() || undefined,
        durationHours: isBan ? durationHours : undefined,
      });
      if (result.failed.length > 0) {
        toast.error(
          `${isBan ? 'Бан' : 'Разбан'}: не удалось для ${formatNumber(result.failed.length)}`,
          {
            description: result.failed
              .map((f) => f.reason)
              .slice(0, 3)
              .join('; '),
          },
        );
      } else {
        toast.success(isBan ? `Забанено: ${target}` : `Разбанено: ${target}`);
      }
      setReason('');
      setHours('');
      onOpenChange(false);
      onDone?.();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isBan ? `Забанить ${target}?` : `Разбанить ${target}?`}
      description={
        isBan
          ? 'Пользователь потеряет доступ к сайту. Действие попадёт в журнал аудита.'
          : 'Доступ будет восстановлен сразу.'
      }
      confirmLabel={isBan ? 'Забанить' : 'Разбанить'}
      destructive={isBan}
      loading={mutation.isPending}
      onConfirm={confirm}
    >
      <div className="flex flex-col gap-3">
        <Field label="Причина" required={isBan}>
          <Textarea
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={isBan ? 'Читы, оскорбления, обход бана…' : 'Необязательно'}
          />
        </Field>
        {isBan ? (
          <Field label="Срок, часов" hint="Пусто — навсегда">
            <Input
              inputMode="numeric"
              pattern="[0-9]*"
              value={hours}
              onChange={(event) => setHours(event.target.value.replace(/\D/g, ''))}
            />
          </Field>
        ) : null}
      </div>
    </ConfirmDialog>
  );
}
