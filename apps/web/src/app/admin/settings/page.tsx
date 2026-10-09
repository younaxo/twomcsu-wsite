'use client';

import type { KvSettings, SiteSettingsDto } from '@twomc/shared';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SeasonalTab } from './_components/seasonal-tab';
import { PageHeader, PageSection } from '@/components/admin/page-header';
import { PermissionGate } from '@/components/admin/permission-gate';
import { QueryBoundary } from '@/components/admin/query-boundary';
import { Button, IconButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
import { useKvSettings, useSiteSettings, useUpsertKvSettings } from '@/lib/admin/hooks';
import { getErrorMessage } from '@/lib/api/errors';
import { usePermissions } from '@/lib/auth/use-permissions';
import { GeneralTab, ModerationTab, ModulesTab } from './_components/site-tabs';
import { SocialLinksTab } from './_components/social-links-tab';
import { useSiteSettingsForm } from './_components/use-site-settings-form';

/* ---------------- Настройки сайта (общая форма трёх вкладок) ---------------- */

const SITE_TABS = [
  { value: 'general', label: 'Общие' },
  { value: 'social', label: 'Соцсети' },
  { value: 'moderation', label: 'Модерация' },
  { value: 'modules', label: 'Модули' },
] as const;

function SiteSettingsTabs({
  settings,
  extraTabs,
}: {
  settings: SiteSettingsDto;
  extraTabs: { value: string; label: string; content: React.ReactNode }[];
}) {
  const { can } = usePermissions();
  const editable = can('settings.site.edit');
  const api = useSiteSettingsForm(settings);
  const props = { settings, api, editable };
  return (
    <>
      <Tabs defaultValue="general" variant="line">
        <TabsList aria-label="Разделы настроек">
          {SITE_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
          {extraTabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="general">
          <GeneralTab {...props} />
        </TabsContent>
        <TabsContent value="social">
          <SocialLinksTab />
        </TabsContent>
        <TabsContent value="moderation">
          <ModerationTab {...props} />
        </TabsContent>
        <TabsContent value="modules">
          <ModulesTab {...props} />
        </TabsContent>
        {extraTabs.map((tab) => (
          <TabsContent key={tab.value} value={tab.value}>
            {tab.content}
          </TabsContent>
        ))}
      </Tabs>
      {editable && api.changedCount > 0 ? (
        <div
          data-testid="settings-save-bar"
          className="sticky bottom-4 z-sticky mt-5 flex flex-wrap items-center gap-3 rounded-xl bg-surface-raised p-3 shadow-lg"
        >
          <p className="text-sm" aria-live="polite">
            Изменено полей: <span className="font-semibold tabular">{api.changedCount}</span>
          </p>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={api.reset}>
              Сбросить
            </Button>
            <Button onClick={api.save} loading={api.saving}>
              Сохранить
            </Button>
          </div>
        </div>
      ) : null}
    </>
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
  const extraTabs = [
    can('settings.view') && {
      value: 'kv',
      label: 'Ключ-значение',
      content: (
        <QueryBoundary query={kv}>{(data) => <KvSettingsEditor initial={data} />}</QueryBoundary>
      ),
    },
    can('settings.seasonal.view') && {
      value: 'seasonal',
      label: 'Сезоны',
      content: <SeasonalTab />,
    },
  ].filter((t): t is { value: string; label: string; content: JSX.Element } => Boolean(t));

  return (
    <PermissionGate requirement={['settings.view', 'settings.site.view']}>
      <PageHeader
        title="Настройки"
        breadcrumbs={[{ label: 'Настройки' }]}
        description="Регистрация, соцсети, модерация и модули сайта."
      />
      {can('settings.site.view') ? (
        <QueryBoundary query={site}>
          {(data) => <SiteSettingsTabs settings={data} extraTabs={extraTabs} />}
        </QueryBoundary>
      ) : (
        <Tabs defaultValue={extraTabs[0]?.value} variant="line">
          <TabsList aria-label="Разделы настроек">
            {extraTabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {extraTabs.map((tab) => (
            <TabsContent key={tab.value} value={tab.value}>
              {tab.content}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </PermissionGate>
  );
}
