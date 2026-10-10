'use client';

import type { NotificationSettingsDto } from '@twomc/shared';
import { Mail, RotateCcw, Send, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { BrandIcon } from '@/components/shell/brand-icon';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SwitchField } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast';
import { getErrorMessage } from '@/lib/api/errors';
import {
  useDeleteDiscordWebhook,
  useResetNotificationSettings,
  useSaveDiscordWebhook,
  useSetTypeEnabled,
  useTestDigest,
  useTestDiscordWebhook,
  useUpdateNotificationSettings,
} from '@/lib/notifications/settings';

/// Секции «Настройки → Уведомления» (срез 2.2, ADR-0110): какие уведомления
/// получать, личный Discord-вебхук, письма (сразу или сводкой) и сброс. Только
/// типы, которые сайт реально отправляет; системные и модерация — всегда.

const island = 'flex flex-col gap-4 rounded-xl bg-surface p-5 shadow-sm';

export const NOTIFICATION_TYPE_GROUPS: Array<{
  title: string;
  types: Array<{ type: string; label: string }>;
}> = [
  {
    title: 'Комментарии и упоминания',
    types: [
      { type: 'COMMENT_ON_PROFILE', label: 'Комментарии в вашем профиле' },
      { type: 'COMMENT_REPLY', label: 'Ответы на ваши комментарии' },
      { type: 'COMMENT_MENTION', label: 'Упоминания в комментариях' },
      { type: 'ACTIVITY_COMMENT', label: 'Комментарии к вашей активности' },
      { type: 'ACTIVITY_COMMENT_MENTION', label: 'Упоминания в активности' },
      { type: 'CHAT_MENTION', label: 'Упоминания в общем чате' },
    ],
  },
  {
    title: 'Друзья',
    types: [
      { type: 'FRIEND_REQUEST', label: 'Заявки в друзья' },
      { type: 'FRIEND_ACCEPTED', label: 'Принятые заявки' },
    ],
  },
  {
    title: 'Новости и события',
    types: [
      { type: 'NEWS_COMMENT_REPLY', label: 'Ответы в комментариях к новостям' },
      { type: 'NEWS_COMMENT_MENTION', label: 'Упоминания в новостях' },
      { type: 'NEWS_LIKED', label: 'Оценки ваших новостей' },
      { type: 'EVENT_UPDATED', label: 'Изменения событий, в которых вы участвуете' },
    ],
  },
];

export function NotificationTypes({ settings }: { settings: NotificationSettingsDto }) {
  const setType = useSetTypeEnabled();
  return (
    <section
      className={island}
      aria-label="Какие уведомления получать"
      data-testid="notification-types"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold">Какие уведомления получать</h2>
        <p className="text-xs text-muted-foreground">
          Выключенный тип не приходит никуда: ни на сайт, ни в push, ни на почту. Объявления,
          техработы и решения модерации приходят всегда.
        </p>
      </div>
      {NOTIFICATION_TYPE_GROUPS.map((group) => (
        <div key={group.title} className="flex flex-col gap-1">
          <h3 className="text-xs font-medium uppercase tracking-wide text-subtle-foreground">
            {group.title}
          </h3>
          {group.types.map(({ type, label }) => (
            <SwitchField
              key={type}
              label={label}
              checked={settings.typeSettings[type] ?? true}
              disabled={setType.isPending && setType.variables?.type === type}
              onCheckedChange={(enabled) =>
                void setType
                  .mutateAsync({ type, enabled })
                  .catch((error) => toast.error(getErrorMessage(error)))
              }
            />
          ))}
        </div>
      ))}
    </section>
  );
}

const WEBHOOK_PATTERN =
  /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/;

export function DiscordChannel({ settings }: { settings: NotificationSettingsDto }) {
  const save = useSaveDiscordWebhook();
  const remove = useDeleteDiscordWebhook();
  const test = useTestDiscordWebhook();
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = url.trim();
    if (!WEBHOOK_PATTERN.test(value)) {
      setError('Нужна ссылка вида https://discord.com/api/webhooks/…');
      return;
    }
    setError(null);
    save.mutate(value, {
      onSuccess: () => {
        setUrl('');
        toast.success('Discord-вебхук подключён');
      },
      onError: (failure) => setError(getErrorMessage(failure)),
    });
  };

  return (
    <section className={island} aria-label="Discord" data-testid="discord-channel">
      <div className="flex flex-wrap items-center gap-2">
        <BrandIcon id="discord" className="size-4" />
        <h2 className="text-sm font-semibold">Уведомления в Discord</h2>
        {settings.discordEnabled ? <Badge tone="success">Подключён</Badge> : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Свой канал на вашем сервере Discord: «Настройки канала → Интеграции → Вебхуки → Новый вебхук
        → Копировать URL». Ссылка хранится на сервере и не показывается целиком.
      </p>
      {settings.discordEnabled ? (
        <div className="flex flex-col gap-3">
          <code className="w-fit break-all rounded bg-surface-sunken px-2 py-1 font-mono text-xs">
            {settings.discordWebhookHint}
          </code>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              loading={test.isPending}
              onClick={() =>
                test.mutate(undefined, {
                  onSuccess: (data) =>
                    data.sent
                      ? toast.success('Проверочное сообщение отправлено в Discord')
                      : toast.error(
                          'Discord не принял сообщение. Проверьте, что вебхук не удалён.',
                        ),
                  onError: (failure) => toast.error(getErrorMessage(failure)),
                })
              }
            >
              <Send />
              Проверить
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>
              <Trash2 />
              Отключить
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-start"
          onSubmit={submit}
          noValidate
        >
          <Field label="Ссылка вебхука" error={error} className="min-w-0 flex-1">
            <Input
              type="url"
              inputMode="url"
              spellCheck={false}
              autoComplete="off"
              placeholder="https://discord.com/api/webhooks/…"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
          </Field>
          <Button
            type="submit"
            className="sm:mt-6"
            loading={save.isPending}
            disabled={url.trim() === ''}
          >
            Подключить
          </Button>
        </form>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Отключить уведомления в Discord?"
        description="Ссылка вебхука будет удалена с сервера. Подключить снова можно новой ссылкой."
        confirmLabel="Отключить"
        destructive
        onConfirm={async () => {
          await remove.mutateAsync();
          toast.success('Discord-вебхук отключён');
        }}
      />
    </section>
  );
}

export function EmailChannel({ settings }: { settings: NotificationSettingsDto }) {
  const update = useUpdateNotificationSettings();
  const test = useTestDigest();
  return (
    <section className={island} aria-label="Почта" data-testid="email-channel">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Mail aria-hidden className="size-4 text-muted-foreground" />
        Уведомления на почту
      </h2>
      {!settings.emailAvailable ? (
        <p className="text-sm text-muted-foreground" data-testid="email-unavailable">
          Письма пока не отправляются: почта на сервере ещё не настроена.
        </p>
      ) : (
        <>
          <SwitchField
            label="Письма с уведомлениями"
            description="Приходят сразу на адрес аккаунта. В тихие часы — только срочные. Сводка по расписанию появится позже."
            checked={settings.emailEnabled}
            disabled={update.isPending}
            onCheckedChange={(emailEnabled) =>
              void update
                .mutateAsync({ emailEnabled })
                .catch((error) => toast.error(getErrorMessage(error)))
            }
          />
          <div>
            <Button
              size="sm"
              variant="secondary"
              loading={test.isPending}
              onClick={() =>
                test.mutate(undefined, {
                  onSuccess: (data) =>
                    data.sent
                      ? toast.success(`Письмо со сводкой отправлено (${data.count})`)
                      : toast.info('Непрочитанных уведомлений нет — письмо не отправлено.'),
                  onError: (failure) => toast.error(getErrorMessage(failure)),
                })
              }
            >
              <Send />
              Прислать сводку непрочитанных
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

export function ResetNotificationSettings() {
  const reset = useResetNotificationSettings();
  const [open, setOpen] = useState(false);
  return (
    <section className={island} aria-label="Сброс настроек">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Сбросить настройки уведомлений</h2>
          <p className="text-xs text-muted-foreground">
            Все переключатели вернутся к значениям по умолчанию, Discord-вебхук отключится.
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
          <RotateCcw />
          Сбросить
        </Button>
      </div>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Сбросить настройки уведомлений?"
        description="Все переключатели вернутся к значениям по умолчанию, Discord-вебхук будет отключён. Подписки браузеров на push сохранятся."
        confirmLabel="Сбросить"
        destructive
        onConfirm={async () => {
          await reset.mutateAsync();
          toast.success('Настройки уведомлений сброшены');
        }}
      />
    </section>
  );
}
