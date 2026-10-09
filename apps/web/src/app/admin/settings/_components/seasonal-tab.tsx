'use client';

import type { PublicSeasonalSettings, SeasonalCampaignOverride } from '@twomc/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { SegmentedControl } from '@/components/ui/segmented-control';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { SwitchField } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast';
import { api } from '@/lib/api/client';
import { getErrorMessage } from '@/lib/api/errors';
import { usePermissions } from '@/lib/auth/use-permissions';
import { SEASONAL_CAMPAIGNS, resolveSeasonalFromSettings } from '@/lib/site/seasonal';

type SeasonalForm = Omit<PublicSeasonalSettings, 'serverTime'>;
const KEY = ['admin', 'settings', 'seasonal'] as const;
const island = 'flex flex-col gap-4 rounded-xl bg-surface p-5 shadow-sm';

function toIsoDay(value: string | null | undefined): string | null {
  return value ? value.slice(0, 10) : null;
}

/// «Настройки → Сезоны» (ADR-0079): ON/OFF целиком, режим, флаги элементов,
/// плотность эффектов, расписание кампаний (серверное время), предпросмотр.
export function SeasonalTab() {
  const client = useQueryClient();
  const { can } = usePermissions();
  const editable = can('settings.seasonal.edit');
  const query = useQuery({
    queryKey: KEY,
    queryFn: () => api.get<SeasonalForm & { updatedAt: string }>('/admin/settings/seasonal'),
  });
  const [form, setForm] = useState<SeasonalForm | null>(null);
  useEffect(() => {
    if (query.data) setForm(query.data);
  }, [query.data]);
  const save = useMutation({
    mutationFn: (body: SeasonalForm) => api.patch<SeasonalForm>('/admin/settings/seasonal', body),
    onSuccess: (data) => {
      client.setQueryData(KEY, data);
      void client.invalidateQueries({ queryKey: ['site', 'settings'] });
      toast.success('Сезонные настройки сохранены');
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const active = useMemo(
    () =>
      form
        ? resolveSeasonalFromSettings({ ...form, serverTime: new Date().toISOString() }, new Date())
        : null,
    [form],
  );

  if (query.isPending || !form) {
    return <Skeleton className="h-64 w-full" />;
  }
  if (query.isError) {
    return <p className="text-sm text-muted-foreground">Не удалось загрузить настройки сезонов.</p>;
  }

  const set = <K extends keyof SeasonalForm>(key: K, value: SeasonalForm[K]) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  const setCampaign = (id: string, patch: SeasonalCampaignOverride) =>
    setForm((prev) =>
      prev
        ? { ...prev, campaigns: { ...prev.campaigns, [id]: { ...prev.campaigns[id], ...patch } } }
        : prev,
    );

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]" data-testid="seasonal-tab">
      <div className="flex flex-col gap-5">
        <section className={island}>
          <h3 className="text-sm font-semibold">Сезонная система</h3>
          <SwitchField
            label="Включена"
            description="Выключено — никаких сезонных элементов на сайте. Основной логотип сезоны не меняют."
            checked={form.enabled}
            disabled={!editable}
            onCheckedChange={(value) => set('enabled', value)}
          />
          <div className="flex flex-wrap items-center gap-3">
            <SegmentedControl
              value={form.mode}
              disabled={!editable || !form.enabled}
              onValueChange={(value) => set('mode', value as SeasonalForm['mode'])}
              options={[
                { value: 'auto', label: 'По расписанию' },
                { value: 'forced', label: 'Принудительно' },
              ]}
            />
            {form.mode === 'forced' ? (
              <Select
                value={form.forcedCampaignId ?? undefined}
                disabled={!editable || !form.enabled}
                onValueChange={(value) => set('forcedCampaignId', value)}
              >
                <SelectTrigger className="w-56" aria-label="Принудительный сезон">
                  <SelectValue placeholder="Выберите сезон" />
                </SelectTrigger>
                <SelectContent>
                  {SEASONAL_CAMPAIGNS.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>
        </section>

        <section className={island}>
          <h3 className="text-sm font-semibold">Что показывать</h3>
          {(
            [
              ['showWordmarkO', 'Сезонная «o» в wordmark'],
              ['showDecoration', 'Декор над шапкой'],
              ['showEffects', 'Эффекты (снег, листья, сердечки…)'],
              ['showBanners', 'Сезонные баннеры'],
            ] as const
          ).map(([key, label]) => (
            <SwitchField
              key={key}
              label={label}
              checked={form[key]}
              disabled={!editable || !form.enabled}
              onCheckedChange={(value) => set(key, value)}
            />
          ))}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm">Плотность эффектов</span>
            <SegmentedControl
              size="sm"
              value={String(form.effectIntensity)}
              disabled={!editable || !form.enabled || !form.showEffects}
              onValueChange={(value) => set('effectIntensity', Number(value))}
              options={[
                { value: '1', label: 'Мало' },
                { value: '2', label: 'Средне' },
                { value: '3', label: 'Много' },
              ]}
            />
          </div>
        </section>

        <section className={island}>
          <h3 className="text-sm font-semibold">Расписание кампаний</h3>
          <p className="text-xs text-muted-foreground">
            Без дат — ежегодное окно по умолчанию. Даты — по времени сервера.
          </p>
          <ul className="flex flex-col divide-y divide-border-subtle">
            {SEASONAL_CAMPAIGNS.map((item) => {
              const override = form.campaigns[item.id] ?? {};
              return (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center gap-3 py-3"
                  data-campaign={item.id}
                >
                  <div className="min-w-[10rem] flex-1">
                    <p className="text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-subtle-foreground">Приоритет {item.priority}</p>
                  </div>
                  <SwitchField
                    label="Вкл."
                    checked={override.enabled !== false}
                    disabled={!editable}
                    onCheckedChange={(value) => setCampaign(item.id, { enabled: value })}
                  />
                  <DatePicker
                    size="sm"
                    aria-label={`${item.name}: начало`}
                    placeholder="Начало"
                    value={toIsoDay(override.startsAt)}
                    disabled={!editable}
                    onChange={(value) =>
                      setCampaign(item.id, { startsAt: value ? `${value}T00:00:00.000Z` : null })
                    }
                  />
                  <DatePicker
                    size="sm"
                    aria-label={`${item.name}: конец`}
                    placeholder="Конец"
                    value={toIsoDay(override.endsAt)}
                    disabled={!editable}
                    onChange={(value) =>
                      setCampaign(item.id, { endsAt: value ? `${value}T23:59:59.000Z` : null })
                    }
                  />
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <aside className="flex flex-col gap-4 xl:sticky xl:top-24 xl:self-start">
        <section className={island} aria-live="polite">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles aria-hidden className="size-4 text-primary" />
            Сейчас на сайте
          </h3>
          <p className="text-sm" data-testid="seasonal-preview">
            {active ? active.name : 'Без сезонного оформления'}
          </p>
          <p className="text-xs text-muted-foreground">
            С учётом несохранённых изменений. После сохранения сайт обновится в течение нескольких
            минут.
          </p>
        </section>
        {editable ? (
          <Button loading={save.isPending} onClick={() => form && save.mutate(form)}>
            Сохранить
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">
            Изменения доступны с правом редактирования сезонов.
          </p>
        )}
      </aside>
    </div>
  );
}
