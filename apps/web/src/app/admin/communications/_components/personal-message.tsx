'use client';

import type { SystemMessageContent } from '@twomc/shared';
import { Send } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Field } from '@/components/ui/field';
import { toast } from '@/components/ui/toast';
import {
  normalizeContent,
  useRecipientSearch,
  useSendSystemMessage,
  validateSystemMessage,
} from '@/lib/admin/communications';
import { getErrorMessage } from '@/lib/api/errors';
import { EMPTY_CONTENT, MessageFields, SystemMessagePreview, island } from './message-composer';

/// Личное системное сообщение: найти пользователя → написать → предпросмотр → отправить.
export function PersonalMessage() {
  const [query, setQuery] = useState<string | null>(null);
  const [recipient, setRecipient] = useState<string | null>(null);
  const [content, setContent] = useState<SystemMessageContent>(EMPTY_CONTENT);
  const [touched, setTouched] = useState(false);
  const search = useRecipientSearch(query);
  const send = useSendSystemMessage();
  const options = (search.data ?? []).map((user) => ({
    value: user.id,
    label: user.username,
    description: `#${user.tag}`,
  }));
  const valid = Object.keys(validateSystemMessage(content)).length === 0;

  const submit = async () => {
    setTouched(true);
    if (!recipient || !valid) return;
    try {
      await send.mutateAsync({ userId: recipient, ...normalizeContent(content) });
      toast.success('Системное сообщение отправлено');
      setContent(EMPTY_CONTENT);
      setTouched(false);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <section className={island}>
        <Field label="Получатель" required hint="Ник или тег игрока">
          <Combobox
            options={options}
            value={recipient}
            onValueChange={setRecipient}
            onSearch={setQuery}
            loading={search.isFetching}
            placeholder="Найти пользователя"
            searchPlaceholder="Ник или тег…"
            emptyText="Никого не нашли"
            invalid={touched && !recipient}
            aria-label="Получатель"
          />
        </Field>
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
          <Button onClick={submit} loading={send.isPending} disabled={!recipient || !valid}>
            <Send />
            Отправить
          </Button>
        </div>
      </section>
      <SystemMessagePreview value={content} />
    </div>
  );
}
