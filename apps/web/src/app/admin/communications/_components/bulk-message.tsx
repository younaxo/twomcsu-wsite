'use client';

import {
  SYSTEM_MESSAGE_LIMITS,
  type SystemMessageAudience,
  type SystemMessageContent,
} from '@twomc/shared';
import { Send, Users } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Field } from '@/components/ui/field';
import { MultiSelect } from '@/components/ui/multi-select';
import { RadioCards } from '@/components/ui/radio-group';
import { toast } from '@/components/ui/toast';
import {
  normalizeContent,
  usePreviewBulkMessage,
  useRecipientSearch,
  useSendBulkMessage,
  validateSystemMessage,
} from '@/lib/admin/communications';
import { useRoles } from '@/lib/admin/hooks';
import { ApiError, getErrorMessage } from '@/lib/api/errors';
import { usePermissions } from '@/lib/auth/use-permissions';
import { formatNumber } from '@/lib/format';
import { EMPTY_CONTENT, MessageFields, SystemMessagePreview, island } from './message-composer';

type AudienceKind = SystemMessageAudience['kind'];

/// Массовая рассылка (опасное действие): аудитория → «Проверить получателей»
/// (точное число с сервера) → подтверждение в диалоге с этим числом. Сервер
/// сверяет число ещё раз и отклоняет отправку, если аудитория изменилась.
export function BulkMessage() {
  const { can } = usePermissions();
  const canListRoles = can('roles.view');
  const roles = useRoles(canListRoles);
  const [kind, setKind] = useState<AudienceKind>('users');
  const [roleId, setRoleId] = useState<string | null>(null);
  const [userIds, setUserIds] = useState<string[]>([]);
  const [query, setQuery] = useState<string | null>(null);
  const [content, setContent] = useState<SystemMessageContent>(EMPTY_CONTENT);
  const [touched, setTouched] = useState(false);
  const [recipients, setRecipients] = useState<number | null>(null);
  const [confirm, setConfirm] = useState(false);
  const search = useRecipientSearch(query);
  const preview = usePreviewBulkMessage();
  const send = useSendBulkMessage();

  const audience: SystemMessageAudience | null =
    kind === 'all'
      ? { kind: 'all' }
      : kind === 'role'
        ? roleId
          ? { kind: 'role', roleId }
          : null
        : userIds.length
          ? { kind: 'users', userIds }
          : null;
  const valid = Object.keys(validateSystemMessage(content)).length === 0;
  const roleName = roles.data?.find((role) => role.id === roleId)?.displayName;
  const audienceText =
    kind === 'all'
      ? 'все активные пользователи'
      : kind === 'role'
        ? `обладатели роли «${roleName ?? '—'}»`
        : 'выбранные пользователи';

  /// Любое изменение аудитории сбрасывает проверенное число получателей.
  const changeAudience = (apply: () => void) => {
    apply();
    setRecipients(null);
  };

  const check = async () => {
    if (!audience) return;
    try {
      const result = await preview.mutateAsync(audience);
      setRecipients(result.recipients);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const submit = async () => {
    if (!audience || recipients === null) return;
    try {
      const result = await send.mutateAsync({
        ...normalizeContent(content),
        audience,
        confirmCount: recipients,
      });
      toast.success(`Отправлено ${formatNumber(result.delivered)} получателям`);
      setConfirm(false);
      setContent(EMPTY_CONTENT);
      setTouched(false);
      setRecipients(null);
    } catch (error) {
      setConfirm(false);
      if (error instanceof ApiError && error.status === 409) setRecipients(null);
      toast.error(getErrorMessage(error));
    }
  };

  const options = (search.data ?? []).map((user) => ({
    value: user.id,
    label: user.username,
    description: `#${user.tag}`,
  }));

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex flex-col gap-5">
        <section className={island}>
          <h3 className="text-sm font-semibold">Кому</h3>
          <RadioCards
            aria-label="Аудитория"
            columns={3}
            value={kind}
            onValueChange={(value) => changeAudience(() => setKind(value as AudienceKind))}
            options={[
              { value: 'users', label: 'Выбранным', description: 'До 100 пользователей' },
              ...(canListRoles
                ? [{ value: 'role', label: 'Роли', description: 'Всем обладателям роли' }]
                : []),
              { value: 'all', label: 'Всем', description: 'Все активные аккаунты' },
            ]}
          />
          {kind === 'users' ? (
            <Field label="Пользователи" required>
              <MultiSelect
                aria-label="Пользователи"
                options={options}
                value={userIds}
                max={SYSTEM_MESSAGE_LIMITS.users}
                onValueChange={(value) => changeAudience(() => setUserIds(value))}
                onSearch={setQuery}
                loading={search.isFetching}
                placeholder="Найти пользователей"
              />
            </Field>
          ) : null}
          {kind === 'role' ? (
            <Field label="Роль" required>
              <Combobox
                aria-label="Роль"
                options={(roles.data ?? []).map((role) => ({
                  value: role.id,
                  label: role.displayName,
                  keywords: [role.slug, role.name],
                }))}
                value={roleId}
                onValueChange={(value) => changeAudience(() => setRoleId(value))}
                loading={roles.isPending}
                placeholder="Выберите роль"
              />
            </Field>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              onClick={check}
              loading={preview.isPending}
              disabled={!audience}
            >
              <Users />
              Проверить получателей
            </Button>
            {recipients !== null ? (
              <span className="text-sm" data-testid="bulk-recipients" aria-live="polite">
                Получателей: <strong className="tabular-nums">{formatNumber(recipients)}</strong>
              </span>
            ) : null}
          </div>
        </section>

        <section className={island}>
          <MessageFields
            value={content}
            onChange={(next) => {
              setContent(next);
              setTouched(true);
            }}
            touched={touched}
            disabled={send.isPending}
          />
          <div>
            <Button
              onClick={() => {
                setTouched(true);
                if (valid && recipients) setConfirm(true);
              }}
              disabled={!valid || !recipients}
            >
              <Send />
              Отправить…
            </Button>
            {!recipients ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Сначала проверьте число получателей.
              </p>
            ) : null}
          </div>
        </section>
      </div>
      <SystemMessagePreview value={content} />

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Отправить ${formatNumber(recipients ?? 0)} получателям?`}
        description={`Получат ${audienceText}. «${content.title.trim()}» придёт в центр уведомлений от имени twomc.su. Отменить отправку будет нельзя.`}
        confirmLabel="Отправить"
        destructive
        loading={send.isPending}
        onConfirm={submit}
      />
    </div>
  );
}
