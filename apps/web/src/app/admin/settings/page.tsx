'use client';

import type { KvSettings, SiteSettingsDto, UpdateSiteSettingsRequest } from '@twomc/shared';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { PageHeader, PageSection } from '@/components/admin/page-header';
import { PermissionGate } from '@/components/admin/permission-gate';
import { QueryBoundary } from '@/components/admin/query-boundary';
import { Button, IconButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { SwitchField } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
import {
  useKvSettings,
  useSiteSettings,
  useUpdateSiteSettings,
  useUpsertKvSettings,
} from '@/lib/admin/hooks';
import { getErrorMessage } from '@/lib/api/errors';
import { usePermissions } from '@/lib/auth/use-permissions';
import { formatDateTime } from '@/lib/format';

/* ---------------- Настройки сайта ---------------- */

type Editable = Omit<SiteSettingsDto, 'id' | 'updatedAt' | 'updatedBy' | 'ipWhitelist'>;
type TextKey = {
  [K in keyof Editable]: Editable[K] extends string | null ? K : never;
}[keyof Editable];
type BoolKey = { [K in keyof Editable]: Editable[K] extends boolean ? K : never }[keyof Editable];

const toForm = (s: SiteSettingsDto): Editable => {
  const copy: Partial<SiteSettingsDto> = { ...s };
  delete copy.id;
  delete copy.updatedAt;
  delete copy.updatedBy;
  delete copy.ipWhitelist;
  return copy as Editable;
};

const TEXT_GROUPS: {
  title: string;
  fields: { key: TextKey; label: string; hint?: string; long?: boolean }[];
}[] = [
  {
    title: 'Основное',
    fields: [
      { key: 'siteName', label: 'Название сайта' },
      { key: 'siteDescription', label: 'Описание', long: true },
      { key: 'contactEmail', label: 'Контактный e-mail' },
      { key: 'siteLogo', label: 'Логотип (URL)' },
      { key: 'siteFavicon', label: 'Favicon (URL)' },
    ],
  },
  {
    title: 'Соцсети',
    fields: [
      { key: 'discordInvite', label: 'Discord-приглашение' },
      { key: 'vkGroup', label: 'Группа VK' },
      { key: 'telegramChannel', label: 'Telegram-канал' },
      { key: 'youtubeChannel', label: 'YouTube-канал' },
    ],
  },
  {
    title: 'SEO и аналитика',
    fields: [
      { key: 'metaTitle', label: 'Meta title' },
      { key: 'metaDescription', label: 'Meta description', long: true },
      { key: 'googleAnalyticsId', label: 'Google Analytics ID' },
      { key: 'yandexMetrikaId', label: 'Яндекс.Метрика ID' },
    ],
  },
];

const BOOL_GROUPS: {
  title: string;
  fields: { key: BoolKey; label: string; description?: string }[];
}[] = [
  {
    title: 'Регистрация',
    fields: [
      { key: 'registrationEnabled', label: 'Регистрация открыта' },
      {
        key: 'registrationRequiresApproval',
        label: 'Требуется одобрение',
        description: 'Новые аккаунты ждут подтверждения',
      },
    ],
  },
  {
    title: 'Модерация',
    fields: [
      { key: 'autoModeration', label: 'Автомодерация' },
      { key: 'profanityFilter', label: 'Фильтр мата' },
    ],
  },
  {
    title: 'Модули сайта',
    fields: [
      { key: 'chatEnabled', label: 'Чат' },
      { key: 'friendsEnabled', label: 'Друзья' },
      { key: 'storeEnabled', label: 'Магазин' },
      { key: 'commentsEnabled', label: 'Комментарии' },
      { key: 'newsEnabled', label: 'Новости' },
      { key: 'reportsEnabled', label: 'Обращения' },
      { key: 'defaultNotificationsEnabled', label: 'Уведомления по умолчанию' },
    ],
  },
  {
    title: 'Безопасность',
    fields: [
      {
        key: 'requireAdmin2fa',
        label: 'Требовать 2FA у администраторов',
        description: 'Флаг сохраняется; механизм 2FA ещё не реализован (ADR-0050)',
      },
    ],
  },
];

function SiteSettingsForm({ settings }: { settings: SiteSettingsDto }) {
  const { can } = usePermissions();
  const editable = can('settings.site.edit');
  const update = useUpdateSiteSettings();
  const [form, setForm] = useState<Editable>(() => toForm(settings));
  const [keywords, setKeywords] = useState(settings.metaKeywords.join(', '));
  useEffect(() => {
    setForm(toForm(settings));
    setKeywords(settings.metaKeywords.join(', '));
  }, [settings]);

  const initial = useMemo(() => toForm(settings), [settings]);
  const diff = useMemo(() => {
    const changes: UpdateSiteSettingsRequest = {};
    for (const key of Object.keys(form) as (keyof Editable)[]) {
      if (key === 'metaKeywords') continue;
      const next = form[key];
      if (next !== initial[key]) {
        (changes as Record<string, unknown>)[key] = next === null ? '' : next;
      }
    }
    const nextKeywords = keywords
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    if (nextKeywords.join('|') !== initial.metaKeywords.join('|')) {
      changes.metaKeywords = nextKeywords;
    }
    return changes;
  }, [form, initial, keywords]);
  const changedCount = Object.keys(diff).length;

  const setText = (key: TextKey, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const setBool = (key: BoolKey, value: boolean) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    try {
      await update.mutateAsync(diff);
      toast.success('Настройки сохранены');
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Обновлено {formatDateTime(settings.updatedAt)}
        {!editable ? ' · только просмотр' : ''}
      </p>
      <div className="grid gap-6 xl:grid-cols-2">
        {TEXT_GROUPS.map((group) => (
          <Card key={group.title} className="flex flex-col gap-4">
            <h3 className="text-base font-semibold">{group.title}</h3>
            {group.fields.map((field) => (
              <Field key={field.key} label={field.label} hint={field.hint}>
                {field.long ? (
                  <Textarea
                    rows={3}
                    value={form[field.key] ?? ''}
                    disabled={!editable}
                    onChange={(e) => setText(field.key, e.target.value)}
                  />
                ) : (
                  <Input
                    value={form[field.key] ?? ''}
                    disabled={!editable}
                    onChange={(e) => setText(field.key, e.target.value)}
                  />
                )}
              </Field>
            ))}
            {group.title === 'SEO и аналитика' ? (
              <Field label="Ключевые слова" hint="Через запятую">
                <Input
                  value={keywords}
                  disabled={!editable}
                  onChange={(e) => setKeywords(e.target.value)}
                />
              </Field>
            ) : null}
          </Card>
        ))}
        {BOOL_GROUPS.map((group) => (
          <Card key={group.title} className="flex flex-col gap-3">
            <h3 className="text-base font-semibold">{group.title}</h3>
            {group.fields.map((field) => (
              <SwitchField
                key={field.key}
                label={field.label}
                description={field.description}
                checked={form[field.key]}
                disabled={!editable}
                onCheckedChange={(value) => setBool(field.key, value)}
              />
            ))}
            {group.title === 'Регистрация' ? (
              <Field label="Лимит аккаунтов" hint="Пусто — без лимита">
                <Input
                  type="number"
                  min={0}
                  value={form.maxUsersLimit ?? ''}
                  disabled={!editable}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      maxUsersLimit: e.target.value === '' ? null : Number(e.target.value),
                    }))
                  }
                />
              </Field>
            ) : null}
          </Card>
        ))}
      </div>
      {editable && changedCount > 0 ? (
        <div className="sticky bottom-4 z-20 flex flex-wrap items-center gap-3 rounded-lg border bg-surface-raised p-3 shadow-lg">
          <p className="text-sm" aria-live="polite">
            Изменено полей: <span className="font-semibold tabular">{changedCount}</span>
          </p>
          <div className="ml-auto flex gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setForm(initial);
                setKeywords(settings.metaKeywords.join(', '));
              }}
            >
              Сбросить
            </Button>
            <Button onClick={save} loading={update.isPending}>
              Сохранить
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ---------------- KV-настройки ---------------- */

function KvSettingsEditor({ initial }: { initial: KvSettings }) {
  const { can } = usePermissions();
  const editable = can('settings.edit');
  const upsert = useUpsertKvSettings();
  const [rows, setRows] = useState<{ key: string; value: string }[]>(() =>
    Object.entries(initial).map(([key, value]) => ({ key, value })),
  );
  useEffect(
    () => setRows(Object.entries(initial).map(([key, value]) => ({ key, value }))),
    [initial],
  );

  const changed = rows.filter((row) => row.key.trim() && initial[row.key] !== row.value);
  const save = async () => {
    try {
      await upsert.mutateAsync({
        settings: Object.fromEntries(changed.map((r) => [r.key.trim(), r.value])),
      });
      toast.success('Сохранено');
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <PageSection
      description="Произвольные ключ-значение. Удаление ключей API не поддерживает — очистите значение."
      actions={
        editable ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setRows([...rows, { key: '', value: '' }])}
          >
            <Plus />
            Добавить ключ
          </Button>
        ) : null
      }
    >
      <Card className="flex flex-col gap-2">
        {rows.length === 0 ? (
          <EmptyState size="sm" title="Настроек нет" />
        ) : (
          rows.map((row, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
              <Input
                aria-label="Ключ"
                placeholder="ключ"
                className="font-mono"
                value={row.key}
                readOnly={row.key in initial}
                disabled={!editable}
                onChange={(e) =>
                  setRows(rows.map((r, i) => (i === index ? { ...r, key: e.target.value } : r)))
                }
              />
              <Input
                aria-label="Значение"
                placeholder="значение"
                value={row.value}
                disabled={!editable}
                onChange={(e) =>
                  setRows(rows.map((r, i) => (i === index ? { ...r, value: e.target.value } : r)))
                }
              />
              {editable && !(row.key in initial) ? (
                <IconButton
                  aria-label="Убрать строку"
                  onClick={() => setRows(rows.filter((_, i) => i !== index))}
                >
                  <Trash2 />
                </IconButton>
              ) : (
                <span />
              )}
            </div>
          ))
        )}
        {editable ? (
          <div className="mt-2">
            <Button onClick={save} disabled={changed.length === 0} loading={upsert.isPending}>
              Сохранить {changed.length > 0 ? `(${changed.length})` : ''}
            </Button>
          </div>
        ) : null}
      </Card>
    </PageSection>
  );
}

export default function SettingsPage() {
  const { can } = usePermissions();
  const site = useSiteSettings(can('settings.site.view'));
  const kv = useKvSettings(can('settings.view'));
  const tabs = [
    can('settings.site.view') && { value: 'site', label: 'Сайт' },
    can('settings.view') && { value: 'kv', label: 'Ключ-значение' },
  ].filter((t): t is { value: string; label: string } => Boolean(t));

  return (
    <PermissionGate requirement={['settings.view', 'settings.site.view']}>
      <PageHeader
        title="Настройки"
        breadcrumbs={[{ label: 'Настройки' }]}
        description="Параметры сайта и произвольные ключи."
      />
      <Tabs defaultValue={tabs[0]?.value} variant="line">
        <TabsList aria-label="Разделы настроек">
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="site">
          <QueryBoundary query={site}>
            {(data) => <SiteSettingsForm settings={data} />}
          </QueryBoundary>
        </TabsContent>
        <TabsContent value="kv">
          <QueryBoundary query={kv}>{(data) => <KvSettingsEditor initial={data} />}</QueryBoundary>
        </TabsContent>
      </Tabs>
    </PermissionGate>
  );
}
