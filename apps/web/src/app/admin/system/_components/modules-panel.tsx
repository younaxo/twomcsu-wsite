'use client';

import type { SiteModuleDto, SiteModuleTier } from '@twomc/shared';
import { Lock, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { QueryBoundary } from '@/components/admin/query-boundary';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { CheckboxField } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast';
import { useSiteModules, useUpdateSiteModule } from '@/lib/admin/system';
import { getErrorMessage } from '@/lib/api/errors';
import { usePermissions } from '@/lib/auth/use-permissions';

const island = 'flex flex-col gap-3 rounded-xl bg-surface p-5 shadow-sm';

const TIERS: { tier: SiteModuleTier; title: string; description: string }[] = [
  {
    tier: 'regular',
    title: 'Модули',
    description: 'Выключенный модуль показывает игрокам «Раздел временно недоступен».',
  },
  {
    tier: 'protected',
    title: 'Защищённые',
    description: 'Широкий эффект: нужно отдельное право и подтверждение.',
  },
  {
    tier: 'core',
    title: 'Ядро',
    description: 'Не выключаются: без них не восстановить доступ к сайту.',
  },
];

/// Модули сайта (ADR-0082): реестр из кода API, состояние по времени сервера.
export function ModulesPanel() {
  const { can } = usePermissions();
  const manage = can('system.modules.manage');
  const protectedAllowed = can('system.modules.protected');
  const query = useSiteModules();
  const update = useUpdateSiteModule();
  const [pending, setPending] = useState<SiteModuleDto | null>(null);
  const [reason, setReason] = useState('');
  const [understood, setUnderstood] = useState(false);

  const toggle = async (item: SiteModuleDto, enabled: boolean) => {
    if (!enabled) {
      setPending(item);
      setReason('');
      setUnderstood(false);
      return;
    }
    try {
      await update.mutateAsync({ key: item.key, body: { enabled: true } });
      toast.success(`«${item.label}» включён`);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const confirmDisable = async () => {
    if (!pending) return;
    try {
      await update.mutateAsync({
        key: pending.key,
        body: { enabled: false, reason: reason.trim() || null },
      });
      toast.success(`«${pending.label}» выключен`);
      setPending(null);
    } catch (error) {
      toast.error(getErrorMessage(error));
      // Окно остаётся открытым (ConfirmDialog закрывается только после успеха).
      throw error;
    }
  };

  return (
    <QueryBoundary query={query} skeleton={<SkeletonRows rows={6} />}>
      {(modules) => (
        <div className="flex flex-col gap-5">
          <p className="text-sm text-muted-foreground" data-testid="modules-summary">
            Выключено: {modules.filter((item) => !item.enabled).length} из{' '}
            {modules.filter((item) => item.tier !== 'core').length}.
          </p>
          {TIERS.map(({ tier, title, description }) => (
            <section key={tier} className={island} aria-label={title}>
              <div>
                <h3 className="text-sm font-semibold">{title}</h3>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
              <ul className="flex flex-col divide-y divide-border-subtle">
                {modules
                  .filter((item) => item.tier === tier)
                  .map((item) => {
                    const locked =
                      tier === 'core' || !manage || (tier === 'protected' && !protectedAllowed);
                    return (
                      <li
                        key={item.key}
                        data-module={item.key}
                        className="flex flex-wrap items-center justify-between gap-3 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-2 text-sm font-medium">
                            {tier === 'core' ? (
                              <Lock aria-hidden className="size-4 text-subtle-foreground" />
                            ) : null}
                            {item.label}
                            {!item.enabled ? <Badge tone="warning">Выключен</Badge> : null}
                          </p>
                          <p className="text-xs text-muted-foreground">{item.description}</p>
                          {!item.enabled && item.reason ? (
                            <p className="text-xs text-subtle-foreground">Причина: {item.reason}</p>
                          ) : null}
                        </div>
                        <Switch
                          aria-label={`${item.label}: ${item.enabled ? 'включён' : 'выключен'}`}
                          checked={item.enabled}
                          disabled={locked || update.isPending}
                          onCheckedChange={(value) => toggle(item, value)}
                        />
                      </li>
                    );
                  })}
              </ul>
              {tier === 'protected' && manage && !protectedAllowed ? (
                <p className="text-xs text-muted-foreground">
                  Нужно право «Выключение защищённых модулей».
                </p>
              ) : null}
            </section>
          ))}

          <ConfirmDialog
            open={pending !== null}
            onOpenChange={(open) => !open && setPending(null)}
            title={`Выключить «${pending?.label ?? ''}»?`}
            description="Игроки увидят «Раздел временно недоступен», а запросы к модулю получат отказ. Админка модуля продолжит работать."
            confirmLabel="Выключить"
            destructive
            loading={update.isPending}
            onConfirm={async () => {
              if (pending?.tier === 'protected' && !understood) {
                toast.error('Подтвердите, что понимаете последствия');
                throw new Error('not-confirmed');
              }
              await confirmDisable();
            }}
          >
            <div className="flex flex-col gap-3">
              <Field label="Причина" hint="Видна только в админке и журнале аудита">
                <Input
                  value={reason}
                  maxLength={300}
                  onChange={(event) => setReason(event.target.value)}
                />
              </Field>
              {pending?.tier === 'protected' ? (
                <CheckboxField
                  label={
                    <span className="flex items-center gap-1.5">
                      <ShieldAlert aria-hidden className="size-4 text-destructive" />
                      Понимаю: модуль затрагивает весь сайт
                    </span>
                  }
                  checked={understood}
                  onCheckedChange={(value) => setUnderstood(value === true)}
                />
              ) : null}
            </div>
          </ConfirmDialog>
        </div>
      )}
    </QueryBoundary>
  );
}
