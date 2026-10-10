'use client';

import type { CreateProfileReportRequest, ProfileReportReason } from '@twomc/shared';
import { PROFILE_REPORT_REASONS } from '@twomc/shared';
import { useMutation } from '@tanstack/react-query';
import { CircleAlert, Flag } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Button, IconButton } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/input';
import { RadioField, RadioGroup } from '@/components/ui/radio-group';
import { toast } from '@/components/ui/toast';
import { Tooltip } from '@/components/ui/tooltip';
import { api } from '@/lib/api/client';
import { getErrorMessage } from '@/lib/api/errors';
import { cn } from '@/lib/cn';

/// Жалоба на профиль (срез 1.3, ADR-0106): круглая кнопка на баннере чужого
/// профиля (там же, где у владельца «Редактировать») и окно с причиной. Только
/// вошедшим и только при включённом модуле «Жалобы и обращения» — решает
/// вызывающий код. Повторная жалоба на того же игрока обновляет прежнюю.

export const PROFILE_REPORT_REASON_LABELS: Record<
  ProfileReportReason,
  { label: string; description: string }
> = {
  SPAM: { label: 'Спам или реклама', description: 'Навязчивая реклама, ссылки, накрутка.' },
  INAPPROPRIATE_CONTENT: {
    label: 'Недопустимый контент',
    description: 'Аватар, обложка, статус или «О себе» нарушают правила.',
  },
  HARASSMENT: {
    label: 'Оскорбления или травля',
    description: 'Угрозы, оскорбления, преследование.',
  },
  IMPERSONATION: {
    label: 'Выдаёт себя за другого',
    description: 'Подделка под игрока, администрацию или известного человека.',
  },
  OTHER: { label: 'Другое', description: 'Опишите проблему ниже.' },
};

const DESCRIPTION_MAX = 1000;

export function ProfileReportDialog({
  username,
  open,
  onOpenChange,
}: {
  username: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [reason, setReason] = useState<ProfileReportReason | null>(null);
  const [description, setDescription] = useState('');
  // Ошибка — у того контрола, который нужно исправить.
  const [error, setError] = useState<{ field: 'reason' | 'description'; text: string } | null>(
    null,
  );
  const reasonErrorId = useId();
  const reset = () => {
    setReason(null);
    setDescription('');
    setError(null);
  };
  const send = useMutation({
    mutationFn: (body: CreateProfileReportRequest) =>
      api.post<{ success: true }>(`/users/${encodeURIComponent(username)}/report`, body),
    onSuccess: () => {
      toast.success('Жалоба отправлена', {
        description: 'Модераторы рассмотрят её в ближайшее время.',
      });
      reset();
      onOpenChange(false);
    },
    onError: (failure) => toast.error(getErrorMessage(failure)),
  });

  const text = description.trim();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!reason) {
      setError({ field: 'reason', text: 'Выберите причину жалобы.' });
      return;
    }
    if (reason === 'OTHER' && !text) {
      setError({
        field: 'description',
        text: 'Опишите проблему — без описания модератору не понять, что случилось.',
      });
      return;
    }
    setError(null);
    send.mutate({ reason, ...(text ? { description: text } : {}) });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent size="md" data-testid="profile-report-dialog">
        <form onSubmit={submit} noValidate className="contents">
          <DialogHeader>
            <DialogTitle>Пожаловаться на профиль</DialogTitle>
            <DialogDescription>
              Жалобу на {username} увидят только модераторы twomc.su.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <RadioGroup
                aria-label="Причина жалобы"
                aria-invalid={error?.field === 'reason' || undefined}
                aria-describedby={error?.field === 'reason' ? reasonErrorId : undefined}
                value={reason ?? ''}
                onValueChange={(value) => {
                  setReason(value as ProfileReportReason);
                  setError(null);
                }}
                className="gap-0"
              >
                {PROFILE_REPORT_REASONS.map((key) => (
                  <RadioField
                    key={key}
                    value={key}
                    label={PROFILE_REPORT_REASON_LABELS[key].label}
                    description={PROFILE_REPORT_REASON_LABELS[key].description}
                  />
                ))}
              </RadioGroup>
              {error?.field === 'reason' ? (
                <p
                  id={reasonErrorId}
                  role="alert"
                  className="flex items-start gap-1.5 text-xs text-destructive"
                >
                  <CircleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
                  <span>{error.text}</span>
                </p>
              ) : null}
            </div>
            <Field
              label="Подробности"
              hint={`Необязательно, кроме «Другое». До ${DESCRIPTION_MAX} символов.`}
              error={error?.field === 'description' ? error.text : null}
              required={reason === 'OTHER'}
              labelAddon={
                <span className="text-xs tabular-nums text-subtle-foreground">
                  {description.length}/{DESCRIPTION_MAX}
                </span>
              }
            >
              <Textarea
                value={description}
                maxLength={DESCRIPTION_MAX}
                rows={3}
                onChange={(event) => {
                  setDescription(event.target.value);
                  if (error?.field === 'description') setError(null);
                }}
                placeholder="Что именно нарушает правила?"
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" loading={send.isPending}>
              <Flag aria-hidden />
              Отправить жалобу
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/// Круглая кнопка «Пожаловаться» на баннере — пара к `ProfileEditButton`.
export function ProfileReportButton({
  username,
  className,
}: {
  username: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Tooltip content="Пожаловаться">
        <IconButton
          size="sm"
          variant="secondary"
          aria-label="Пожаловаться"
          data-testid="profile-report"
          onClick={() => setOpen(true)}
          className={cn(
            'rounded-full shadow-sm transition-colors',
            'hover:bg-destructive-soft hover:text-destructive',
            'focus-visible:bg-destructive-soft focus-visible:text-destructive',
            className,
          )}
        >
          <Flag />
        </IconButton>
      </Tooltip>
      <ProfileReportDialog username={username} open={open} onOpenChange={setOpen} />
    </>
  );
}
