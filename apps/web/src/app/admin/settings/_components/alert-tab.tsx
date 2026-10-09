'use client';

import {
  SITE_ALERT_ICONS,
  SITE_ALERT_VARIANTS,
  type SiteAlertDto,
  type SiteAlertIcon,
  type SiteAlertVariant,
} from '@twomc/shared';
import { useEffect, useMemo, useState } from 'react';
import { QueryBoundary } from '@/components/admin/query-boundary';
import {
  SITE_ALERT_ICON_COMPONENTS,
  SITE_ALERT_ICON_LABELS,
  SITE_ALERT_VARIANT_LABELS,
  SiteAlertView,
} from '@/components/shell/global-alert-bar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SwitchField } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast';
import { useSiteAlert, useUpdateSiteAlert } from '@/lib/admin/hooks';
import { getErrorMessage } from '@/lib/api/errors';
import { usePermissions } from '@/lib/auth/use-permissions';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';
import { SettingsAside, SettingsIsland, SettingsLayout, SummaryRow } from './layout';

type Draft = Pick<
  SiteAlertDto,
  'enabled' | 'variant' | 'icon' | 'title' | 'message' | 'linkUrl' | 'linkLabel'
>;

const toDraft = (alert: SiteAlertDto): Draft => ({
  enabled: alert.enabled,
  variant: alert.variant,
  icon: alert.icon,
  title: alert.title,
  message: alert.message,
  linkUrl: alert.linkUrl,
  linkLabel: alert.linkLabel,
});

const LINK_PATTERN = /^(https:\/\/\S+|\/(?!\/)\S*)$/;

function AlertEditor({ alert }: { alert: SiteAlertDto }) {
  const { can } = usePermissions();
  const editable = can('settings.alert.edit');
  const update = useUpdateSiteAlert();
  const initial = useMemo(() => toDraft(alert), [alert]);
  const [draft, setDraft] = useState<Draft>(initial);
  useEffect(() => setDraft(initial), [initial]);

  const changed = (Object.keys(draft) as (keyof Draft)[]).filter(
    (key) => (draft[key] ?? null) !== (initial[key] ?? null),
  );
  const messageEmpty = draft.message.trim() === '';
  const linkInvalid = !!draft.linkUrl && !LINK_PATTERN.test(draft.linkUrl.trim());
  const linkIncomplete = !!draft.linkUrl !== !!draft.linkLabel;
  const errors = [
    draft.enabled && messageEmpty ? 'Чтобы включить плашку, нужен текст сообщения.' : null,
    linkInvalid ? 'Ссылка — https://… или внутренний путь /…' : null,
    linkIncomplete ? 'Ссылка и её подпись задаются вместе.' : null,
  ].filter(Boolean);

  const save = () =>
    update.mutate(
      {
        ...draft,
        title: draft.title?.trim() || null,
        message: draft.message.trim(),
        linkUrl: draft.linkUrl?.trim() || null,
        linkLabel: draft.linkLabel?.trim() || null,
      },
      {
        onSuccess: (data) =>
          toast.success(data.enabled ? 'Плашка опубликована' : 'Плашка сохранена (выключена)'),
        onError: (error) => toast.error(getErrorMessage(error)),
      },
    );

  const preview = {
    variant: draft.variant,
    icon: draft.icon,
    title: draft.title?.trim() || null,
    message: draft.message.trim() || 'Текст сообщения появится здесь',
    linkUrl: draft.linkUrl?.trim() || null,
    linkLabel: draft.linkLabel?.trim() || null,
  };

  return (
    <SettingsLayout
      main={
        <>
          <SettingsIsland
            title="Плашка под шапкой"
            description="Заметное сообщение для всех посетителей. Пользователь не может её закрыть — она видна, пока включена."
            actions={
              <Badge tone={alert.enabled ? 'destructive' : 'neutral'}>
                {alert.enabled ? 'Опубликована' : 'Выключена'}
              </Badge>
            }
          >
            <SwitchField
              label="Показывать на сайте"
              description="После сохранения плашка появится или исчезнет у всех"
              checked={draft.enabled}
              disabled={!editable}
              onCheckedChange={(value) => setDraft((d) => ({ ...d, enabled: value }))}
            />
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Стиль">
                <Select
                  value={draft.variant}
                  disabled={!editable}
                  onValueChange={(value) =>
                    setDraft((d) => ({ ...d, variant: value as SiteAlertVariant }))
                  }
                >
                  <SelectTrigger aria-label="Стиль плашки">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SITE_ALERT_VARIANTS.map((variant) => (
                      <SelectItem key={variant} value={variant}>
                        {SITE_ALERT_VARIANT_LABELS[variant]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Заголовок" hint="Необязательно, до 80 символов">
                <Input
                  maxLength={80}
                  value={draft.title ?? ''}
                  disabled={!editable}
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                />
              </Field>
            </div>
            <Field label="Текст сообщения" required hint={`${draft.message.length}/500`}>
              <Textarea
                rows={3}
                maxLength={500}
                value={draft.message}
                disabled={!editable}
                onChange={(e) => setDraft((d) => ({ ...d, message: e.target.value }))}
              />
            </Field>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">Иконка</legend>
              <div
                className="grid grid-cols-4 gap-2 sm:grid-cols-6"
                role="radiogroup"
                aria-label="Иконка плашки"
              >
                {SITE_ALERT_ICONS.map((icon) => {
                  const Icon = SITE_ALERT_ICON_COMPONENTS[icon];
                  const selected = draft.icon === icon;
                  return (
                    <button
                      key={icon}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={SITE_ALERT_ICON_LABELS[icon]}
                      title={SITE_ALERT_ICON_LABELS[icon]}
                      disabled={!editable}
                      onClick={() => setDraft((d) => ({ ...d, icon: icon as SiteAlertIcon }))}
                      className={cn(
                        'flex h-11 items-center justify-center rounded-lg bg-background-subtle text-muted-foreground transition-colors duration-fast hover:bg-muted hover:text-foreground',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                        selected && 'bg-primary-soft text-primary ring-1 ring-primary/40',
                      )}
                    >
                      <Icon aria-hidden className="size-5" />
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
              <Field label="Ссылка" hint="https://… или /страница — необязательно">
                <Input
                  value={draft.linkUrl ?? ''}
                  disabled={!editable}
                  onChange={(e) => setDraft((d) => ({ ...d, linkUrl: e.target.value || null }))}
                />
              </Field>
              <Field label="Текст ссылки">
                <Input
                  maxLength={40}
                  value={draft.linkLabel ?? ''}
                  disabled={!editable}
                  onChange={(e) => setDraft((d) => ({ ...d, linkLabel: e.target.value || null }))}
                />
              </Field>
            </div>
            {errors.length > 0 ? (
              <ul className="flex flex-col gap-1 text-sm text-destructive" role="alert">
                {errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            ) : null}
            {editable ? (
              <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-4">
                <Button
                  onClick={save}
                  loading={update.isPending}
                  disabled={changed.length === 0 || errors.length > 0}
                >
                  Сохранить
                </Button>
                <Button
                  variant="ghost"
                  disabled={changed.length === 0}
                  onClick={() => setDraft(initial)}
                >
                  Сбросить
                </Button>
                {changed.length > 0 ? (
                  <span className="text-sm text-muted-foreground">
                    Есть несохранённые изменения
                  </span>
                ) : null}
              </div>
            ) : null}
          </SettingsIsland>
        </>
      }
      aside={
        <>
          <SettingsAside title="Предпросмотр">
            <SiteAlertView alert={preview} />
            <p className="text-xs text-subtle-foreground">
              Так плашка выглядит под шапкой сайта. На телефоне текст переносится.
            </p>
          </SettingsAside>
          <SettingsAside title="Состояние">
            <SummaryRow label="Сейчас на сайте" value={alert.enabled ? 'показывается' : 'нет'} />
            <SummaryRow label="Обновлено" value={formatDateTime(alert.updatedAt)} />
            <p className="text-xs text-subtle-foreground">
              Включение, выключение и правки записываются в журнал аудита.
            </p>
          </SettingsAside>
        </>
      }
    />
  );
}

export function AlertTab() {
  const alert = useSiteAlert();
  return <QueryBoundary query={alert}>{(data) => <AlertEditor alert={data} />}</QueryBoundary>;
}
