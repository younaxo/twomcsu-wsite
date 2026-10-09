'use client';

import {
  SITE_ALERT_ICONS,
  SITE_ALERT_STYLES,
  SITE_ALERT_VARIANTS,
  type SiteAlertDto,
  type SiteAlertIcon,
  type SiteAlertStyle,
  type SiteAlertVariant,
} from '@twomc/shared';
import { FileUp, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { QueryBoundary } from '@/components/admin/query-boundary';
import {
  GlobalAlertBar,
  SITE_ALERT_ICON_COMPONENTS,
  SITE_ALERT_ICON_LABELS,
  SITE_ALERT_STYLE_LABELS,
  SITE_ALERT_VARIANT_LABELS,
  SiteAlertIconView,
} from '@/components/shell/global-alert-bar';
import { Badge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { DatePicker, type IsoDate } from '@/components/ui/date-picker';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast';
import { useSiteAlert, useUpdateSiteAlert } from '@/lib/admin/hooks';
import { getErrorMessage } from '@/lib/api/errors';
import { usePermissions } from '@/lib/auth/use-permissions';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';

/// Редактор верхней информационной плашки (ADR-0066) — «Объявления».
/// Композиция «Полдня»: слева один остров-редактор (секции разделены
/// отступами и типографикой, без карточки вокруг каждого куска), справа —
/// sticky-панель с живым предпросмотром той же <GlobalAlertBar/>, что на
/// сайте, и сводкой состояния. Время — в поясе браузера, хранится в UTC,
/// показ — по серверному времени.

type Draft = Pick<
  SiteAlertDto,
  | 'enabled'
  | 'variant'
  | 'displayStyle'
  | 'icon'
  | 'title'
  | 'message'
  | 'linkUrl'
  | 'linkLabel'
  | 'customIcon'
  | 'startsAt'
  | 'endsAt'
>;

const DRAFT_KEYS: (keyof Draft)[] = [
  'enabled',
  'variant',
  'displayStyle',
  'icon',
  'title',
  'message',
  'linkUrl',
  'linkLabel',
  'customIcon',
  'startsAt',
  'endsAt',
];

const toDraft = (alert: SiteAlertDto): Draft =>
  Object.fromEntries(DRAFT_KEYS.map((key) => [key, alert[key]])) as Draft;

const LINK_PATTERN = /^(https:\/\/\S+|\/(?!\/)\S*)$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const SVG_MAX_BYTES = 16 * 1024;

const VARIANT_DOT: Record<SiteAlertVariant, string> = {
  danger: 'bg-destructive',
  warning: 'bg-warning',
  info: 'bg-primary',
  success: 'bg-success',
};

const pad = (value: number) => String(value).padStart(2, '0');

/// UTC ISO → локальные дата (YYYY-MM-DD) и время (HH:MM).
function splitLocal(iso: string | null): { date: IsoDate | null; time: string } {
  if (!iso) return { date: null, time: '' };
  const d = new Date(iso);
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/// Локальные дата + время → UTC ISO (null, если дата не задана).
function joinLocal(date: IsoDate | null, time: string): string | null {
  if (!date) return null;
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = TIME_PATTERN.test(time) ? time.split(':').map(Number) : [0, 0];
  return new Date(y as number, (m as number) - 1, d, hh, mm).toISOString();
}

function timezoneLabel(): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const offset = -new Date().getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '−';
  const abs = Math.abs(offset);
  return `${zone} (UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)})`;
}

/// Клиентская подсказка; окончательная проверка SVG — на backend.
function quickSvgCheck(svg: string): string | null {
  const trimmed = svg.trim();
  if (new Blob([trimmed]).size > SVG_MAX_BYTES) return 'SVG больше 16 КБ';
  if (!/^(<\?xml[^>]*\?>\s*)?<svg[\s>]/i.test(trimmed)) return 'Это не SVG-документ';
  if (/<script|\son[a-z]+\s*=|javascript:|<foreignObject/i.test(trimmed)) {
    return 'SVG содержит скрипты или обработчики — такой файл не принимается';
  }
  return null;
}

/// Секция внутри острова: заголовок + необязательная подпись, без рамки.
function Section({
  title,
  hint,
  aside,
  children,
}: {
  title: string;
  hint?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3.5">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          {hint ? <p className="mt-0.5 text-xs text-subtle-foreground">{hint}</p> : null}
        </div>
        {aside}
      </header>
      {children}
    </section>
  );
}

function ScheduleRow({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string | null;
  onChange: (iso: string | null) => void;
  disabled: boolean;
}) {
  const initial = splitLocal(value);
  const [date, setDate] = useState<IsoDate | null>(initial.date);
  const [time, setTime] = useState(initial.time || '00:00');
  useEffect(() => {
    const next = splitLocal(value);
    setDate(next.date);
    setTime(next.time || '00:00');
  }, [value]);
  const timeInvalid = !!date && !TIME_PATTERN.test(time);
  return (
    <Field
      label={label}
      error={timeInvalid ? 'Время в формате ЧЧ:ММ' : null}
      labelAddon={date ? null : <span className="text-xs text-subtle-foreground">не указано</span>}
    >
      <div className="flex gap-2">
        <DatePicker
          value={date}
          disabled={disabled}
          clearable
          size="sm"
          placeholder="Без ограничения"
          onChange={(next) => {
            setDate(next);
            onChange(joinLocal(next, time));
          }}
          className="min-w-0 flex-1"
        />
        <Input
          aria-label={`${label}: время`}
          inputMode="numeric"
          placeholder="00:00"
          maxLength={5}
          size="sm"
          className="w-[4.75rem] text-center font-mono tabular"
          value={time}
          disabled={disabled || !date}
          invalid={timeInvalid}
          onChange={(e) => {
            const next = e.target.value.replace(/[^\d:]/g, '');
            setTime(next);
            if (TIME_PATTERN.test(next)) onChange(joinLocal(date, next));
          }}
        />
      </div>
    </Field>
  );
}

/// Сводка «параметр — значение» правой панели.
function StatusRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium">{children}</dd>
    </div>
  );
}

function AlertEditor({ alert }: { alert: SiteAlertDto }) {
  const { can } = usePermissions();
  const editable = can('settings.alert.edit');
  const update = useUpdateSiteAlert();
  const initial = useMemo(() => toDraft(alert), [alert]);
  const [draft, setDraft] = useState<Draft>(initial);
  const [svgError, setSvgError] = useState<string | null>(null);
  const [previewWidth, setPreviewWidth] = useState<'desktop' | 'mobile'>('desktop');
  const [previewTheme, setPreviewTheme] = useState<'dark' | 'light'>('dark');
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => setDraft(initial), [initial]);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const changed = DRAFT_KEYS.filter((key) => (draft[key] ?? null) !== (initial[key] ?? null));
  const linkInvalid = !!draft.linkUrl && !LINK_PATTERN.test(draft.linkUrl.trim());
  const scheduleInvalid =
    !!draft.startsAt && !!draft.endsAt && new Date(draft.endsAt) <= new Date(draft.startsAt);
  const errors = [
    draft.enabled && draft.message.trim() === ''
      ? 'Чтобы включить плашку, нужен текст сообщения.'
      : null,
    linkInvalid ? 'Ссылка — https://… или внутренний путь /…' : null,
    !!draft.linkUrl !== !!draft.linkLabel ? 'Ссылка и её текст задаются вместе.' : null,
    draft.icon === 'custom' && !draft.customIcon ? 'Загрузите SVG для своей иконки.' : null,
    scheduleInvalid ? 'Окончание показа должно быть позже начала.' : null,
    svgError,
  ].filter((value): value is string => Boolean(value));

  const acceptSvg = (svg: string) => {
    const problem = quickSvgCheck(svg);
    setSvgError(problem);
    if (!problem) {
      setDraft((d) => ({ ...d, customIcon: svg.trim(), icon: 'custom' }));
    }
  };

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
    displayStyle: draft.displayStyle,
    icon: draft.icon,
    customIcon: draft.customIcon,
    title: draft.title?.trim() || null,
    message: draft.message.trim() || 'Текст сообщения появится здесь',
    linkUrl: linkInvalid ? null : draft.linkUrl?.trim() || null,
    linkLabel: draft.linkLabel?.trim() || null,
  };

  const now = new Date();
  const scheduledLater = !!alert.startsAt && new Date(alert.startsAt) > now;
  const expired = !!alert.endsAt && new Date(alert.endsAt) <= now;
  const liveNow = alert.enabled && alert.message.trim() !== '' && !scheduledLater && !expired;
  const statusLabel = liveNow
    ? 'Активна'
    : !alert.enabled
      ? 'Отключена'
      : scheduledLater
        ? 'Запланирована'
        : expired
          ? 'Срок показа истёк'
          : 'Отключена';

  const selectedIcon =
    draft.icon === 'custom'
      ? 'Свой SVG'
      : SITE_ALERT_ICON_LABELS[draft.icon as Exclude<SiteAlertIcon, 'custom'>];

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,32%)]">
      {/* ── Редактор ─────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-7 rounded-xl bg-surface p-5 shadow-sm md:p-6">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold tracking-tight">
                Верхняя информационная плашка
              </h2>
              <p className="mt-1 max-w-prose text-sm text-muted-foreground">
                Полоса под шапкой сайта для всех посетителей. Закрыть её нельзя — она видна, пока
                включена и действует расписание.
              </p>
            </div>
            <label className="flex shrink-0 items-center gap-3 rounded bg-background-subtle py-2 pl-3.5 pr-2.5">
              <span className="text-sm font-medium">
                {draft.enabled ? 'Включена' : 'Выключена'}
              </span>
              <Switch
                aria-label="Показывать плашку"
                checked={draft.enabled}
                disabled={!editable}
                onCheckedChange={(value) => set('enabled', value)}
              />
            </label>
          </header>

          <Section title="Оформление">
            <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
              <Field label="Стиль отображения">
                <SegmentedControl
                  aria-label="Стиль отображения плашки"
                  value={draft.displayStyle}
                  disabled={!editable}
                  onValueChange={(value) => set('displayStyle', value as SiteAlertStyle)}
                  options={SITE_ALERT_STYLES.map((style) => ({
                    value: style,
                    label: SITE_ALERT_STYLE_LABELS[style],
                  }))}
                />
              </Field>
              <Field label="Тип">
                <Select
                  value={draft.variant}
                  disabled={!editable}
                  onValueChange={(value) => set('variant', value as SiteAlertVariant)}
                >
                  <SelectTrigger aria-label="Тип плашки" size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SITE_ALERT_VARIANTS.map((variant) => (
                      <SelectItem key={variant} value={variant}>
                        <span className="inline-flex items-center gap-2">
                          <span
                            aria-hidden
                            className={cn('size-2 rounded-full', VARIANT_DOT[variant])}
                          />
                          {SITE_ALERT_VARIANT_LABELS[variant]}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </Section>

          <Section title="Содержание">
            <Field
              label="Заголовок"
              labelAddon={<span className="text-xs text-subtle-foreground">необязательно</span>}
            >
              <Input
                size="sm"
                maxLength={80}
                placeholder="Например: Технические работы"
                value={draft.title ?? ''}
                disabled={!editable}
                onChange={(e) => set('title', e.target.value)}
              />
            </Field>
            <Field
              label="Текст сообщения"
              required
              labelAddon={
                <span className="font-mono text-xs tabular text-subtle-foreground">
                  {draft.message.length}/500
                </span>
              }
            >
              <Textarea
                rows={3}
                maxLength={500}
                value={draft.message}
                disabled={!editable}
                onChange={(e) => set('message', e.target.value)}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <Field
                label="Ссылка"
                labelAddon={<span className="text-xs text-subtle-foreground">необязательно</span>}
              >
                <Input
                  size="sm"
                  placeholder="/status или https://…"
                  value={draft.linkUrl ?? ''}
                  disabled={!editable}
                  invalid={linkInvalid}
                  onChange={(e) => set('linkUrl', e.target.value || null)}
                />
              </Field>
              <Field label="Текст ссылки">
                <Input
                  size="sm"
                  maxLength={40}
                  placeholder="Подробнее"
                  value={draft.linkLabel ?? ''}
                  disabled={!editable}
                  onChange={(e) => set('linkLabel', e.target.value || null)}
                />
              </Field>
            </div>
          </Section>

          <Section
            title="Иконка"
            aside={
              <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <SiteAlertIconView alert={{ ...preview, displayStyle: 'outline' }} />
                {selectedIcon}
              </span>
            }
          >
            <div
              className="grid grid-cols-6 gap-1.5 sm:grid-cols-8 2xl:grid-cols-12"
              role="radiogroup"
              aria-label="Иконка плашки"
            >
              {SITE_ALERT_ICONS.filter((icon) => icon !== 'custom').map((icon) => {
                const Icon = SITE_ALERT_ICON_COMPONENTS[icon as Exclude<SiteAlertIcon, 'custom'>];
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
                    onClick={() => set('icon', icon)}
                    className={cn(
                      'flex h-10 items-center justify-center rounded-sm text-muted-foreground transition-colors duration-fast',
                      'hover:bg-background-subtle hover:text-foreground',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                      selected &&
                        'bg-primary-soft text-primary hover:bg-primary-soft hover:text-primary',
                    )}
                  >
                    <Icon aria-hidden className="size-[18px]" />
                  </button>
                );
              })}
              {draft.customIcon ? (
                <button
                  type="button"
                  role="radio"
                  aria-checked={draft.icon === 'custom'}
                  aria-label="Свой SVG"
                  title="Свой SVG"
                  disabled={!editable}
                  onClick={() => set('icon', 'custom')}
                  className={cn(
                    'flex h-10 items-center justify-center rounded-sm transition-colors duration-fast hover:bg-background-subtle',
                    draft.icon === 'custom' && 'bg-primary-soft',
                  )}
                >
                  <SiteAlertIconView alert={{ ...preview, icon: 'custom' }} />
                </button>
              ) : null}
            </div>
            {editable ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".svg,image/svg+xml"
                  className="sr-only"
                  tabIndex={-1}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) void file.text().then(acceptSvg);
                  }}
                />
                <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()}>
                  <FileUp />
                  Свой SVG
                </Button>
                {draft.customIcon ? (
                  <IconButton
                    size="sm"
                    aria-label="Убрать свой SVG"
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        customIcon: null,
                        icon: d.icon === 'custom' ? 'alert-triangle' : d.icon,
                      }))
                    }
                  >
                    <X />
                  </IconButton>
                ) : null}
                <span className="text-xs text-subtle-foreground">
                  до 16 КБ · без скриптов · проверяется сервером
                </span>
              </div>
            ) : null}
          </Section>

          <Section title="Расписание" hint={timezoneLabel()}>
            <div className="grid gap-4 md:grid-cols-2">
              <ScheduleRow
                label="Показывать с"
                value={draft.startsAt}
                disabled={!editable}
                onChange={(value) => set('startsAt', value)}
              />
              <ScheduleRow
                label="Показывать до"
                value={draft.endsAt}
                disabled={!editable}
                onChange={(value) => set('endsAt', value)}
              />
            </div>
          </Section>
        </div>

        {editable ? (
          <div
            data-testid="alert-action-bar"
            className="sticky bottom-4 z-sticky flex flex-wrap items-center justify-end gap-3 rounded-xl bg-surface-raised px-4 py-3 shadow-lg"
          >
            {errors.length > 0 ? (
              <p role="alert" className="min-w-0 flex-1 text-sm text-destructive">
                {errors[0]}
                {errors.length > 1 ? ` (+${errors.length - 1})` : ''}
              </p>
            ) : (
              <p
                className="min-w-0 flex-1 text-sm text-muted-foreground max-sm:sr-only"
                aria-live="polite"
              >
                {changed.length > 0 ? 'Есть несохранённые изменения' : 'Изменений нет'}
              </p>
            )}
            <Button
              variant="ghost"
              disabled={changed.length === 0}
              onClick={() => {
                setDraft(initial);
                setSvgError(null);
              }}
            >
              Отменить
            </Button>
            <Button
              onClick={save}
              loading={update.isPending}
              disabled={changed.length === 0 || errors.length > 0}
            >
              Сохранить изменения
            </Button>
          </div>
        ) : null}
      </div>

      {/* ── Предпросмотр и состояние ─────────────────────────────── */}
      <aside className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-24">
        <section className="flex flex-col gap-3 rounded-xl bg-surface p-4 shadow-sm">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold tracking-tight">Предпросмотр</h3>
            <div className="flex gap-1.5">
              <SegmentedControl
                size="sm"
                aria-label="Ширина предпросмотра"
                value={previewWidth}
                onValueChange={(value) => setPreviewWidth(value as 'desktop' | 'mobile')}
                options={[
                  { value: 'desktop', label: 'Desktop' },
                  { value: 'mobile', label: 'Mobile' },
                ]}
              />
              <SegmentedControl
                size="sm"
                aria-label="Тема предпросмотра"
                value={previewTheme}
                onValueChange={(value) => setPreviewTheme(value as 'dark' | 'light')}
                options={[
                  { value: 'dark', label: 'Dark' },
                  { value: 'light', label: 'Light' },
                ]}
              />
            </div>
          </header>
          {/* Тема превью — тем же атрибутом data-theme, что и у сайта. */}
          <div
            data-theme={previewTheme}
            data-testid="alert-preview"
            className="overflow-hidden rounded-lg bg-background p-2 text-foreground"
          >
            <div
              className={cn(
                'mx-auto pb-3 transition-[max-width] duration-fast',
                previewWidth === 'mobile' ? 'max-w-[300px]' : 'max-w-none',
              )}
            >
              <div className="flex h-9 items-center gap-2 rounded-lg bg-surface px-3 shadow-sm">
                <span className="size-4 rounded-sm bg-primary/80" aria-hidden />
                <span className="h-2 w-16 rounded-full bg-muted" aria-hidden />
                <span className="ml-auto h-2 w-10 rounded-full bg-muted" aria-hidden />
              </div>
              <GlobalAlertBar alert={preview} />
              <div className="mt-3 flex flex-col gap-1.5 px-2" aria-hidden>
                <span className="h-2 w-3/4 rounded-full bg-muted" />
                <span className="h-2 w-1/2 rounded-full bg-muted" />
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-xl bg-surface p-4 shadow-sm">
          <header className="mb-1 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold tracking-tight">Состояние</h3>
            <Badge tone={liveNow ? 'primary' : 'neutral'}>{statusLabel}</Badge>
          </header>
          <dl className="divide-y divide-border-subtle">
            <StatusRow label="Показывается с">
              {alert.startsAt ? formatDateTime(alert.startsAt) : 'сразу'}
            </StatusRow>
            <StatusRow label="Показывается до">
              {alert.endsAt ? formatDateTime(alert.endsAt) : 'бессрочно'}
            </StatusRow>
            <StatusRow label="Последнее изменение">{formatDateTime(alert.updatedAt)}</StatusRow>
            <StatusRow label="Кем изменено">{alert.updatedByUsername ?? '—'}</StatusRow>
          </dl>
          <p className="mt-2 text-xs text-subtle-foreground">
            Включение, выключение и правки пишутся в журнал аудита.
          </p>
        </section>
      </aside>
    </div>
  );
}

export function GlobalAlertEditor() {
  const alert = useSiteAlert();
  return <QueryBoundary query={alert}>{(data) => <AlertEditor alert={data} />}</QueryBoundary>;
}
