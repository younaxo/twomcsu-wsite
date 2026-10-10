'use client';

import type { PublicSeasonalSettings, SeasonalCampaignOverride } from '@twomc/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { SeasonalPreviewFrame } from '@/components/seasonal/seasonal-preview-frame';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { MultiSelect } from '@/components/ui/multi-select';
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
import { usePublicSiteSettings } from '@/lib/site/hooks';
import { isoToLocalParts, localPartsToIso, timezoneLabel } from '@/lib/site/local-datetime';
import {
  SEASONAL_CAMPAIGNS,
  SEASONAL_EFFECTS,
  SEASONAL_MAX_EFFECTS,
  fallingModeOf,
  resolveSeasonalFromSettings,
  resolveSeasonalView,
  withOverrides,
  type SeasonalCampaign,
  type SeasonalEffect,
} from '@/lib/site/seasonal';

type SeasonalForm = Omit<PublicSeasonalSettings, 'serverTime'>;
const KEY = ['admin', 'settings', 'seasonal'] as const;
const island = 'flex flex-col gap-4 rounded-xl bg-surface p-5 shadow-sm';
const EFFECT_OPTIONS = SEASONAL_EFFECTS.map((item) => ({ value: item.id, label: item.label }));
const effectLabel = (id: SeasonalEffect) =>
  SEASONAL_EFFECTS.find((item) => item.id === id)?.label ?? id;

/// Время сервера: смещение относительно часов браузера по ответу `/site/settings`
/// (ADR-0079) — предпросмотр «сейчас на сайте» не зависит от часов админа.
function useServerNow(): () => Date {
  const site = usePublicSiteSettings();
  const serverTime = site.data?.seasonal?.serverTime;
  const skew = serverTime && site.dataUpdatedAt ? Date.parse(serverTime) - site.dataUpdatedAt : 0;
  return () => new Date(Date.now() + skew);
}

/// «Настройки → Сезоны» (ADR-0079): ON/OFF целиком, режим, флаги элементов,
/// плотность эффектов, расписание и эффекты кампаний (время сервера, пояс
/// админа), предпросмотр desktop/mobile в тёмной и светлой теме.
export function SeasonalTab() {
  const client = useQueryClient();
  const { can } = usePermissions();
  const editable = can('settings.seasonal.edit');
  const serverNow = useServerNow();
  const zone = useMemo(() => timezoneLabel(), []);
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

  const now = serverNow();
  const active = form
    ? resolveSeasonalFromSettings({ ...form, serverTime: now.toISOString() }, now)
    : null;

  if (query.isError) {
    return <p className="text-sm text-muted-foreground">Не удалось загрузить настройки сезонов.</p>;
  }
  if (query.isPending || !form) {
    return <Skeleton className="h-64 w-full" />;
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
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]" data-testid="seasonal-tab">
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
          <h3 className="text-sm font-semibold">Оформление сезона</h3>
          <p className="text-xs text-muted-foreground">
            Работает только при активной кампании. Каждый элемент включается отдельно.
          </p>
          {(
            [
              ['showWordmarkO', 'Сезонная «o» в wordmark'],
              ['showDecoration', 'Украшение шапки'],
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
        </section>

        <FallingEffectSection form={form} editable={editable} set={set} />

        <section className={island}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">Кампании: расписание и эффекты</h3>
            <span className="text-xs text-subtle-foreground" data-testid="seasonal-timezone">
              Часовой пояс: {zone}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Без дат — ежегодное окно по умолчанию. Сайт сверяет даты по времени сервера. При
            пересечении показывается одна кампания — с большим приоритетом.
          </p>
          <ul className="flex flex-col divide-y divide-border-subtle">
            {SEASONAL_CAMPAIGNS.map((item) => (
              <CampaignRow
                key={item.id}
                campaign={item}
                override={form.campaigns[item.id] ?? {}}
                editable={editable}
                onChange={(patch) => setCampaign(item.id, patch)}
              />
            ))}
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
        <SeasonalPreview form={form} active={active} />
        {editable ? (
          <Button loading={save.isPending} onClick={() => save.mutate(form)}>
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

function CampaignRow({
  campaign,
  override,
  editable,
  onChange,
}: {
  campaign: SeasonalCampaign;
  override: SeasonalCampaignOverride;
  editable: boolean;
  onChange: (patch: SeasonalCampaignOverride) => void;
}) {
  const start = isoToLocalParts(override.startsAt);
  const end = isoToLocalParts(override.endsAt);
  const customEffects = Array.isArray(override.effects);
  const effects = customEffects ? override.effects! : campaign.effects;
  const defaults = campaign.effects.length
    ? campaign.effects.map(effectLabel).join(', ')
    : 'без эффектов';

  return (
    <li className="flex flex-col gap-3 py-4" data-campaign={campaign.id}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{campaign.name}</p>
          <p className="text-xs text-subtle-foreground">Приоритет {campaign.priority}</p>
        </div>
        <SwitchField
          label="Вкл."
          checked={override.enabled !== false}
          disabled={!editable}
          onCheckedChange={(value) => onChange({ enabled: value })}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            ['startsAt', 'начало', start, '00:00'],
            ['endsAt', 'конец', end, '23:59'],
          ] as const
        ).map(([key, label, parts, fallback]) => (
          <div key={key} className="flex items-center gap-2">
            <DatePicker
              size="sm"
              aria-label={`${campaign.name}: ${label}`}
              placeholder={label === 'начало' ? 'Начало' : 'Конец'}
              value={parts.date}
              disabled={!editable}
              onChange={(value) =>
                onChange({
                  [key]: value ? localPartsToIso(value, parts.time, fallback) : null,
                })
              }
            />
            <Input
              type="time"
              size="sm"
              className="w-28"
              aria-label={`${campaign.name}: время, ${label}`}
              value={parts.time}
              disabled={!editable || !parts.date}
              onChange={(event) =>
                parts.date &&
                onChange({ [key]: localPartsToIso(parts.date, event.target.value, fallback) })
              }
            />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <MultiSelect
          size="sm"
          className="min-w-[14rem] flex-1"
          aria-label={`${campaign.name}: эффекты`}
          options={EFFECT_OPTIONS}
          value={effects}
          max={SEASONAL_MAX_EFFECTS}
          placeholder="Без эффектов"
          disabled={!editable}
          onValueChange={(value) => onChange({ effects: value as SeasonalEffect[] })}
        />
        {customEffects ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={!editable}
            onClick={() => onChange({ effects: null })}
          >
            По умолчанию
          </Button>
        ) : (
          <span className="text-xs text-subtle-foreground">По умолчанию: {defaults}</span>
        )}
      </div>
    </li>
  );
}

/// Предпросмотр до публикации: любая кампания, desktop/mobile, dark/light —
/// те же компоненты, что на сайте (wordmark, декор шапки, движок эффектов).
const MODE_OPTIONS = [
  { value: 'season', label: 'По сезону' },
  { value: 'always', label: 'Всегда' },
  { value: 'off', label: 'Выключен' },
];

/// Падающий эффект (ADR-0090) — отдельно от оформления сезона: «По сезону» —
/// эффекты активной кампании, «Всегда» — выбранный тип даже без сезона,
/// «Выключен» — ничего не падает, даже в сезон.
function FallingEffectSection({
  form,
  editable,
  set,
}: {
  form: SeasonalForm;
  editable: boolean;
  set: <K extends keyof SeasonalForm>(key: K, value: SeasonalForm[K]) => void;
}) {
  const mode = fallingModeOf({ ...form, serverTime: '' });
  return (
    <section className={island} aria-label="Падающий эффект">
      <h3 className="text-sm font-semibold">Падающий эффект</h3>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm">Режим</span>
        <SegmentedControl
          size="sm"
          aria-label="Режим падающего эффекта"
          value={mode}
          disabled={!editable}
          onValueChange={(value) => {
            set('fallingMode', value as SeasonalForm['fallingMode']);
            set('showEffects', value !== 'off');
          }}
          options={MODE_OPTIONS}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {mode === 'season'
          ? 'Падают эффекты активной кампании (их набор — в списке кампаний ниже). Без сезона — ничего.'
          : mode === 'always'
            ? 'Выбранный эффект падает всегда — независимо от того, активен ли сезон.'
            : 'Падающих элементов нет, даже если сезон активен. Остальное оформление сезона работает.'}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm">Тип</span>
        <Select
          value={form.fallingEffect ?? ''}
          disabled={!editable || mode !== 'always'}
          onValueChange={(value) => set('fallingEffect', value as SeasonalEffect)}
        >
          <SelectTrigger size="sm" aria-label="Тип падающего эффекта" className="w-48">
            <SelectValue placeholder="Выберите эффект" />
          </SelectTrigger>
          <SelectContent>
            {SEASONAL_EFFECTS.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm">Плотность</span>
        <SegmentedControl
          size="sm"
          aria-label="Плотность эффекта"
          value={String(form.effectIntensity)}
          disabled={!editable || mode === 'off'}
          onValueChange={(value) => set('effectIntensity', Number(value))}
          options={[
            { value: '1', label: 'Мало' },
            { value: '2', label: 'Средне' },
            { value: '3', label: 'Много' },
          ]}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm">Скорость</span>
        <SegmentedControl
          size="sm"
          aria-label="Скорость эффекта"
          value={String(form.effectSpeed)}
          disabled={!editable || mode === 'off'}
          onValueChange={(value) => set('effectSpeed', Number(value))}
          options={[
            { value: '1', label: 'Медленно' },
            { value: '2', label: 'Обычно' },
            { value: '3', label: 'Быстро' },
          ]}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        На телефонах частиц меньше; на слабых устройствах, при экономии трафика и с «уменьшением
        движения» эффект автоматически упрощается или выключается. Элементы не перехватывают клики.
      </p>
    </section>
  );
}

function SeasonalPreview({
  form,
  active,
}: {
  form: SeasonalForm;
  active: SeasonalCampaign | null;
}) {
  const [campaignId, setCampaignId] = useState('site');
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  // Комбинации без активации реального сезона: оформление и эффект — отдельно.
  const [seasonOn, setSeasonOn] = useState(true);
  const [effectOn, setEffectOn] = useState(true);
  const campaign =
    campaignId === 'site'
      ? active
      : withOverrides(SEASONAL_CAMPAIGNS.find((item) => item.id === campaignId) ?? null, form);
  const now = new Date();
  const view = resolveSeasonalView({ ...form, serverTime: now.toISOString() }, now, {
    campaign,
    season: seasonOn,
    effect: effectOn,
  });

  return (
    <section className={island}>
      <h3 className="text-sm font-semibold">Предпросмотр</h3>
      <Select value={campaignId} onValueChange={setCampaignId}>
        <SelectTrigger size="sm" aria-label="Кампания для предпросмотра">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="site">Как на сайте сейчас</SelectItem>
          {SEASONAL_CAMPAIGNS.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {item.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex flex-wrap gap-2">
        <SegmentedControl
          size="sm"
          aria-label="Устройство"
          value={device}
          onValueChange={(value) => setDevice(value as 'desktop' | 'mobile')}
          options={[
            { value: 'desktop', label: 'Компьютер' },
            { value: 'mobile', label: 'Телефон' },
          ]}
        />
        <SegmentedControl
          size="sm"
          aria-label="Тема"
          value={theme}
          onValueChange={(value) => setTheme(value as 'dark' | 'light')}
          options={[
            { value: 'dark', label: 'Тёмная' },
            { value: 'light', label: 'Светлая' },
          ]}
        />
      </div>
      <div className="flex flex-col gap-2">
        <SwitchField
          label="Оформление сезона"
          description="«o», украшение шапки, баннеры"
          checked={seasonOn}
          onCheckedChange={setSeasonOn}
        />
        <SwitchField label="Падающий эффект" checked={effectOn} onCheckedChange={setEffectOn} />
      </div>
      <SeasonalPreviewFrame view={view} device={device} theme={theme} />
    </section>
  );
}
