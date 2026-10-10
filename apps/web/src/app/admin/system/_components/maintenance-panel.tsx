'use client';

import type { MaintenanceSettingsDto, UpdateMaintenanceRequest } from '@twomc/shared';
import { useEffect, useMemo, useState } from 'react';
import { DateTimeField } from '@/components/admin/date-time-field';
import { QueryBoundary } from '@/components/admin/query-boundary';
import { MaintenanceScreen, ModuleUnavailable } from '@/components/system/site-availability';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { MultiSelect } from '@/components/ui/multi-select';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { SkeletonRows } from '@/components/ui/skeleton';
import { SwitchField } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast';
import { useMaintenanceSettings, useSiteModules, useUpdateMaintenance } from '@/lib/admin/system';
import { getErrorMessage } from '@/lib/api/errors';
import { usePermissions } from '@/lib/auth/use-permissions';
import { timezoneLabel } from '@/lib/site/local-datetime';

const island = 'flex flex-col gap-4 rounded-xl bg-surface p-5 shadow-sm';
const when = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });

function toForm(data: MaintenanceSettingsDto): UpdateMaintenanceRequest {
  return {
    enabled: data.enabled,
    scope: data.scope,
    modules: data.modules,
    title: data.title,
    message: data.message,
    reason: data.reason,
    startsAt: data.startsAt,
    estimatedEnd: data.estimatedEnd,
  };
}

export function validateMaintenance(form: UpdateMaintenanceRequest) {
  const errors: Partial<Record<'title' | 'message' | 'modules' | 'period', string>> = {};
  if (!form.title.trim()) errors.title = 'Введите заголовок';
  if (!form.message.trim()) errors.message = 'Введите сообщение для игроков';
  if (form.enabled && form.scope === 'partial' && form.modules.length === 0) {
    errors.modules = 'Выберите модули';
  }
  if (
    form.startsAt &&
    form.estimatedEnd &&
    Date.parse(form.startsAt) >= Date.parse(form.estimatedEnd)
  ) {
    errors.period = 'Начало должно быть раньше окончания';
  }
  return errors;
}

function statusLine(data: MaintenanceSettingsDto) {
  if (!data.enabled) return { text: 'Выключены', tone: 'neutral' as const };
  if (data.active) return { text: 'Идут сейчас', tone: 'warning' as const };
  return {
    text: data.startsAt
      ? `Запланированы на ${when.format(new Date(data.startsAt))}`
      : 'Запланированы',
    tone: 'info' as const,
  };
}

/// Технические работы (ADR-0082): полные — весь сайт, кроме входа, админки и
/// мониторинга; частичные — выбранные модули. Время — сервера, в форме —
/// пояс администратора.
export function MaintenancePanel() {
  const { can } = usePermissions();
  const editable = can('system.maintenance.manage');
  const query = useMaintenanceSettings();
  const modules = useSiteModules(can('system.modules.view'));
  const save = useUpdateMaintenance();
  const [form, setForm] = useState<UpdateMaintenanceRequest | null>(null);
  const [touched, setTouched] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const zone = useMemo(() => timezoneLabel(), []);

  useEffect(() => {
    if (query.data) setForm(toForm(query.data));
  }, [query.data]);

  const moduleOptions = (modules.data ?? [])
    .filter((item) => item.tier !== 'core')
    .map((item) => ({ value: item.key, label: item.label }));

  const submit = async () => {
    if (!form) return;
    try {
      await save.mutateAsync({
        ...form,
        title: form.title.trim(),
        message: form.message.trim(),
        reason: form.reason?.trim() || null,
        modules: form.scope === 'partial' ? form.modules : [],
      });
      toast.success(form.enabled ? 'Технические работы сохранены' : 'Технические работы выключены');
      setConfirm(false);
    } catch (error) {
      toast.error(getErrorMessage(error));
      throw error;
    }
  };

  return (
    <QueryBoundary query={query} skeleton={<SkeletonRows rows={6} />}>
      {(data) => {
        if (!form) return <SkeletonRows rows={6} />;
        const errors = touched ? validateMaintenance(form) : {};
        const valid = Object.keys(validateMaintenance(form)).length === 0;
        const set = <K extends keyof UpdateMaintenanceRequest>(
          key: K,
          value: UpdateMaintenanceRequest[K],
        ) => setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
        const closesSite =
          form.enabled && form.scope === 'full' && !(data.enabled && data.scope === 'full');
        const status = statusLine(data);
        return (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
            <section className={island}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Технические работы</h3>
                <Badge tone={status.tone} data-testid="maintenance-status">
                  {status.text}
                </Badge>
              </div>
              <SwitchField
                label="Включены"
                description="Без даты начала — сразу после сохранения. Окончание — ожидаемое: работы не выключаются сами."
                checked={form.enabled}
                disabled={!editable}
                onCheckedChange={(value) => set('enabled', value)}
              />
              <Field label="Что закрыть">
                <SegmentedControl
                  aria-label="Масштаб работ"
                  value={form.scope}
                  disabled={!editable}
                  onValueChange={(value) =>
                    set('scope', value as UpdateMaintenanceRequest['scope'])
                  }
                  options={[
                    { value: 'full', label: 'Весь сайт' },
                    { value: 'partial', label: 'Отдельные модули' },
                  ]}
                />
              </Field>
              {form.scope === 'partial' ? (
                <Field label="Модули" required error={errors.modules}>
                  <MultiSelect
                    aria-label="Модули на техработах"
                    options={moduleOptions}
                    value={form.modules}
                    disabled={!editable}
                    loading={modules.isPending}
                    placeholder="Выберите модули"
                    onValueChange={(value) => set('modules', value)}
                  />
                </Field>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Вход, админка и мониторинг продолжают работать. Сотрудники с правом обхода видят
                  сайт.
                </p>
              )}
              <Field label="Заголовок" required error={errors.title}>
                <Input
                  value={form.title}
                  maxLength={120}
                  disabled={!editable}
                  onChange={(event) => set('title', event.target.value)}
                />
              </Field>
              <Field label="Сообщение для игроков" required error={errors.message}>
                <Textarea
                  rows={3}
                  value={form.message}
                  maxLength={1000}
                  disabled={!editable}
                  onChange={(event) => set('message', event.target.value)}
                />
              </Field>
              <Field label="Причина" hint="Только для админки и журнала аудита">
                <Input
                  value={form.reason ?? ''}
                  maxLength={300}
                  disabled={!editable}
                  onChange={(event) => set('reason', event.target.value)}
                />
              </Field>
              <Field label="Время" hint={`Часовой пояс: ${zone}`} error={errors.period}>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <DateTimeField
                    label="Начало"
                    value={form.startsAt}
                    fallbackTime="00:00"
                    onChange={(value) => set('startsAt', value)}
                  />
                  <DateTimeField
                    label="Окончание"
                    value={form.estimatedEnd}
                    fallbackTime="23:59"
                    onChange={(value) => set('estimatedEnd', value)}
                  />
                </div>
              </Field>
              {editable ? (
                <div>
                  <Button
                    loading={save.isPending}
                    variant={closesSite ? 'destructive' : 'primary'}
                    onClick={() => {
                      setTouched(true);
                      if (!valid) return;
                      if (closesSite) setConfirm(true);
                      else void submit().catch(() => undefined);
                    }}
                  >
                    Сохранить
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Изменения доступны с правом управления техработами.
                </p>
              )}
            </section>

            <aside className="flex flex-col gap-2 xl:sticky xl:top-24 xl:self-start">
              <p className="text-xs text-muted-foreground">Что увидят игроки</p>
              <div
                className="overflow-hidden rounded-xl bg-background-subtle"
                data-testid="maintenance-preview"
              >
                {form.scope === 'full' ? (
                  <div className="origin-top scale-[0.8] [&>main]:min-h-0 [&>main]:bg-transparent [&>main]:py-4">
                    <MaintenanceScreen
                      maintenance={{
                        active: true,
                        scope: 'full',
                        modules: [],
                        title: form.title,
                        message: form.message,
                        startsAt: form.startsAt,
                        estimatedEnd: form.estimatedEnd,
                      }}
                    />
                  </div>
                ) : (
                  <div className="p-4">
                    <ModuleUnavailable
                      reason="MAINTENANCE"
                      maintenance={{
                        active: true,
                        scope: 'partial',
                        modules: form.modules,
                        title: form.title,
                        message: form.message,
                        startsAt: form.startsAt,
                        estimatedEnd: form.estimatedEnd,
                      }}
                    />
                  </div>
                )}
              </div>
            </aside>

            <ConfirmDialog
              open={confirm}
              onOpenChange={setConfirm}
              title="Закрыть весь сайт для игроков?"
              description={
                form.startsAt && Date.parse(form.startsAt) > Date.now()
                  ? `Сайт закроется ${when.format(new Date(form.startsAt))}. Вход и админка останутся доступны.`
                  : 'Сайт закроется сразу после сохранения. Вход и админка останутся доступны.'
              }
              confirmLabel="Закрыть сайт"
              destructive
              loading={save.isPending}
              onConfirm={submit}
            />
          </div>
        );
      }}
    </QueryBoundary>
  );
}
