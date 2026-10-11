'use client';

import { Copy, Link2, Plus } from 'lucide-react';
import { useState } from 'react';
import { DateTimeField } from '@/components/admin/date-time-field';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { useFormInvites, type FormInviteDto } from '@/lib/admin/forms';
import { getErrorMessage } from '@/lib/api/errors';
import { formatDateTime } from '@/lib/format';

/// Приглашения формы (срез 7.4, ADR-0150): ссылки /forms/invite/:code с
/// необязательным лимитом использований и сроком; копирование и удаление.

const digits = (value: string) => value.replace(/\D/g, '');

export function inviteUrl(code: string): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return `${origin}/forms/invite/${encodeURIComponent(code)}`;
}

function usage(invite: FormInviteDto): string {
  const uses = invite.maxUses
    ? `использовано ${invite.usedCount} из ${invite.maxUses}`
    : `использовано ${invite.usedCount}`;
  return invite.expiresAt ? `${uses} · до ${formatDateTime(invite.expiresAt)}` : uses;
}

function CreateInviteDialog({
  onCreate,
  loading,
  onClose,
}: {
  onCreate: (body: { maxUses?: number; expiresAt?: string }) => void;
  loading: boolean;
  onClose: () => void;
}) {
  const [maxUses, setMaxUses] = useState('');
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Новое приглашение</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3">
          <Field label="Сколько раз можно ответить" hint="Пусто — без ограничения">
            <Input
              inputMode="numeric"
              value={maxUses}
              onChange={(e) => setMaxUses(digits(e.target.value))}
            />
          </Field>
          <Field label="Действует до" hint="Пусто — бессрочно" error={error ?? undefined}>
            <DateTimeField
              label="Действует до"
              value={expiresAt}
              fallbackTime="23:59"
              onChange={setExpiresAt}
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button
            loading={loading}
            onClick={() => {
              if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
                setError('Срок должен быть в будущем');
                return;
              }
              onCreate({
                ...(Number(maxUses) >= 1 ? { maxUses: Number(maxUses) } : {}),
                ...(expiresAt ? { expiresAt } : {}),
              });
            }}
          >
            Создать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FormInvites({ formId, inviteOnly }: { formId: string; inviteOnly: boolean }) {
  const { invites, create, remove } = useFormInvites(formId, true);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<FormInviteDto | null>(null);
  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(inviteUrl(code));
      toast.success('Ссылка скопирована');
    } catch {
      toast.error('Не удалось скопировать — выделите ссылку вручную');
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {inviteOnly
          ? 'Форма открыта только по приглашениям — ответить можно лишь по одной из этих ссылок.'
          : 'Форма открыта и без приглашения — ссылка просто ведёт на неё; лимит и счётчик ответов действуют только у форм «по приглашению».'}
      </p>
      <Button className="self-start" onClick={() => setCreating(true)}>
        <Plus />
        Новое приглашение
      </Button>
      {invites.isPending ? (
        <SkeletonRows rows={3} />
      ) : invites.isError ? (
        <ErrorState error={invites.error} onRetry={() => invites.refetch()} />
      ) : invites.data.length === 0 ? (
        <EmptyState icon={<Link2 />} title="Приглашений нет" />
      ) : (
        <ul
          className="flex flex-col divide-y divide-border-subtle rounded-xl bg-surface shadow-sm"
          data-testid="form-invites"
        >
          {invites.data.map((invite) => (
            <li key={invite.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="break-all font-mono text-xs">{inviteUrl(invite.code)}</span>
                <span className="text-xs text-muted-foreground">{usage(invite)}</span>
              </div>
              <Button size="sm" variant="secondary" onClick={() => void copy(invite.code)}>
                <Copy />
                Скопировать
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDeleting(invite)}>
                Удалить
              </Button>
            </li>
          ))}
        </ul>
      )}
      {creating ? (
        <CreateInviteDialog
          loading={create.isPending}
          onClose={() => setCreating(false)}
          onCreate={(body) =>
            create.mutate(body, {
              onSuccess: () => {
                toast.success('Приглашение создано');
                setCreating(false);
              },
              onError: (error) => toast.error(getErrorMessage(error)),
            })
          }
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Удалить приглашение?"
        description="Ссылка перестанет работать."
        confirmLabel="Удалить"
        destructive
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(deleting!.code, {
            onSuccess: () => {
              toast.success('Приглашение удалено');
              setDeleting(null);
            },
            onError: (error) => toast.error(getErrorMessage(error)),
          })
        }
      />
    </div>
  );
}
