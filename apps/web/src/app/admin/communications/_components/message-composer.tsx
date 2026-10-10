'use client';

import { SYSTEM_MESSAGE_LIMITS, type SystemMessageContent } from '@twomc/shared';
import { SystemSender } from '@/components/notifications/system-sender';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { validateSystemMessage } from '@/lib/admin/communications';

export const island = 'flex flex-col gap-4 rounded-xl bg-surface p-5 shadow-sm';

export const EMPTY_CONTENT: SystemMessageContent = { title: '', message: '', link: '' };

/// Поля системного сообщения: заголовок, текст, необязательная ссылка.
/// Ошибки показываются после первого ввода (`touched`).
export function MessageFields({
  value,
  onChange,
  touched,
  disabled,
}: {
  value: SystemMessageContent;
  onChange: (value: SystemMessageContent) => void;
  touched: boolean;
  disabled?: boolean;
}) {
  const errors = touched ? validateSystemMessage(value) : {};
  return (
    <>
      <Field label="Заголовок" required error={errors.title}>
        <Input
          value={value.title}
          maxLength={SYSTEM_MESSAGE_LIMITS.title}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, title: event.target.value })}
        />
      </Field>
      <Field
        label="Текст"
        required
        error={errors.message}
        hint={`${value.message.trim().length} / ${SYSTEM_MESSAGE_LIMITS.message}`}
      >
        <Textarea
          rows={6}
          value={value.message}
          maxLength={SYSTEM_MESSAGE_LIMITS.message}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, message: event.target.value })}
        />
      </Field>
      <Field label="Ссылка" hint="Необязательно: /account или https://…" error={errors.link}>
        <Input
          value={value.link ?? ''}
          placeholder="/account"
          disabled={disabled}
          onChange={(event) => onChange({ ...value, link: event.target.value })}
        />
      </Field>
    </>
  );
}

/// Предпросмотр так, как сообщение выглядит в центре уведомлений получателя.
export function SystemMessagePreview({ value }: { value: SystemMessageContent }) {
  const title = value.title.trim();
  const message = value.message.trim();
  return (
    <section className={island} aria-label="Предпросмотр сообщения">
      <h3 className="text-sm font-semibold">Предпросмотр</h3>
      <div
        className="flex gap-3 rounded-lg bg-background-subtle px-3 py-2.5"
        data-testid="system-message-preview"
      >
        <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
        <span className="min-w-0 flex-1">
          <SystemSender className="mb-0.5" />
          <span className="block text-sm font-semibold">{title || 'Заголовок'}</span>
          <span className="block whitespace-pre-wrap text-xs text-muted-foreground">
            {message || 'Текст сообщения появится здесь.'}
          </span>
          {value.link?.trim() ? (
            <span className="block truncate text-xs text-primary-soft-foreground">
              {value.link.trim()}
            </span>
          ) : null}
          <span className="block text-[11px] text-subtle-foreground">только что</span>
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Сообщение придёт в центр уведомлений — даже если получатель отключил системные уведомления.
        Ответить на него нельзя.
      </p>
    </section>
  );
}
