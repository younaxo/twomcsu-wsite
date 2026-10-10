'use client';

import {
  STORAGE_CLEANUP_PERIODS,
  STORAGE_RETENTION_OPTIONS,
  type StorageCategoryDto,
  type StorageCleanupPeriod,
  type StorageRetentionDays,
} from '@twomc/shared';
import { Database, Lock, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { PermissionGate } from '@/components/admin/permission-gate';
import { QueryBoundary } from '@/components/admin/query-boundary';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { SegmentedControl } from '@/components/ui/segmented-control';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SkeletonRows } from '@/components/ui/skeleton';
import { SwitchField } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast';
import {
  useStorageCleanup,
  useStorageOverview,
  useStoragePreview,
  useUpdateStorageRetention,
} from '@/lib/admin/storage';
import { getErrorMessage } from '@/lib/api/errors';
import { usePermissions } from '@/lib/auth/use-permissions';
import { formatBytes, formatDateTime, formatNumber } from '@/lib/format';

const island = 'flex flex-col gap-4 rounded-xl bg-surface p-5 shadow-sm';

function retentionLabel(days: StorageRetentionDays): string {
  return days === 0 ? 'Не удалять' : `${days} дней`;
}

/// Ручная очистка категории: период → предпросмотр с сервера → подтверждение.
function CleanupDialog({
  category,
  onClose,
}: {
  category: StorageCategoryDto | null;
  onClose: () => void;
}) {
  const [period, setPeriod] = useState<StorageCleanupPeriod>(365);
  const preview = useStoragePreview();
  const cleanup = useStorageCleanup();
  const key = category?.key;

  useEffect(() => {
    if (key) preview.mutate({ category: key, olderThanDays: period });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mutate стабилен
  }, [key, period]);

  const count = preview.data?.count ?? null;
  return (
    <ConfirmDialog
      open={category !== null}
      onOpenChange={(open) => !open && onClose()}
      title={`Очистить «${category?.label ?? ''}»?`}
      description="Удалённые записи не восстановить. Очистка записывается в журнал аудита."
      confirmLabel="Очистить"
      destructive
      loading={cleanup.isPending}
      onConfirm={async () => {
        if (!category || count === null) throw new Error('preview');
        try {
          const result = await cleanup.mutateAsync({
            category: category.key,
            olderThanDays: period,
            confirmCount: count,
          });
          toast.success(`Удалено записей: ${formatNumber(result.deleted)}`);
        } catch (error) {
          toast.error(getErrorMessage(error));
          if (category) preview.mutate({ category: category.key, olderThanDays: period });
          throw error;
        }
      }}
    >
      <div className="flex flex-col gap-3">
        <Field label="Что удалить">
          <SegmentedControl
            size="sm"
            aria-label="Период очистки"
            value={String(period)}
            onValueChange={(value) =>
              setPeriod(value === 'null' ? null : (Number(value) as StorageCleanupPeriod))
            }
            options={STORAGE_CLEANUP_PERIODS.map((days) => ({
              value: String(days),
              label: days === null ? 'Все' : `> ${days} дн.`,
            }))}
          />
        </Field>
        <p className="text-sm" data-testid="cleanup-preview" aria-live="polite">
          {preview.isPending || count === null
            ? 'Считаем записи…'
            : count === 0
              ? 'Удалять нечего.'
              : `Будет удалено: ${formatNumber(count)} записей (≈ ${formatBytes(preview.data?.bytes ?? 0)}).`}
        </p>
      </div>
    </ConfirmDialog>
  );
}

/// «Система → Хранилище и журналы» (ADR-0084): сроки хранения служебных
/// журналов, объём, ручная и автоматическая очистка. Пользовательские данные
/// (профили, сообщения, заказы, уведомления, файлы) здесь не удаляются.
export default function StoragePage() {
  const { can } = usePermissions();
  const manage = can('system.storage.manage');
  const sensitiveAllowed = can('system.storage.audit');
  const query = useStorageOverview();
  const update = useUpdateStorageRetention();
  const [cleaning, setCleaning] = useState<StorageCategoryDto | null>(null);

  const save = async (body: Parameters<typeof update.mutateAsync>[0]) => {
    try {
      await update.mutateAsync(body);
      toast.success('Сроки хранения сохранены');
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <PermissionGate requirement="system.storage.view">
      <PageHeader
        title="Хранилище и журналы"
        breadcrumbs={[{ label: 'Система' }, { label: 'Хранилище и журналы' }]}
        description="Сроки хранения служебных журналов и их очистка. Данные игроков здесь не удаляются."
      />
      <QueryBoundary query={query} skeleton={<SkeletonRows rows={6} />}>
        {(data) => (
          <div className="flex flex-col gap-5">
            <section className={island}>
              <SwitchField
                label="Автоматическая очистка"
                description="Раз в сутки в 04:00 удаляет записи старше заданного срока."
                checked={data.autoCleanup}
                disabled={!manage || update.isPending}
                onCheckedChange={(value) => void save({ autoCleanup: value })}
              />
              <p className="text-xs text-muted-foreground" data-testid="storage-last-run">
                {data.lastRunAt
                  ? `Последняя очистка: ${formatDateTime(data.lastRunAt)} (${data.lastRunTrigger === 'auto' ? 'автоматически' : 'вручную'}).`
                  : 'Очистка ещё не выполнялась.'}{' '}
                Незавершённые загрузки старше суток и удалённые файлы стираются автоматически каждый
                день.
              </p>
            </section>

            <div className="grid gap-5 lg:grid-cols-2">
              {data.categories.map((category) => {
                const locked = !manage || (category.sensitive && !sensitiveAllowed);
                return (
                  <section
                    key={category.key}
                    className={island}
                    data-category={category.key}
                    aria-label={category.label}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="flex items-center gap-2 text-sm font-semibold">
                          {category.sensitive ? (
                            <Lock aria-hidden className="size-4 text-subtle-foreground" />
                          ) : (
                            <Database aria-hidden className="size-4 text-subtle-foreground" />
                          )}
                          {category.label}
                        </h3>
                        <p className="text-xs text-muted-foreground">{category.description}</p>
                      </div>
                      <p className="shrink-0 text-right text-sm tabular-nums">
                        {formatNumber(category.total)}
                        <span className="block text-xs text-subtle-foreground">
                          {formatBytes(category.totalBytes)}
                        </span>
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-sm">Хранить</span>
                      <Select
                        value={String(category.retentionDays)}
                        disabled={locked || update.isPending}
                        onValueChange={(value) =>
                          void save({
                            retention: { [category.key]: Number(value) as StorageRetentionDays },
                          })
                        }
                      >
                        <SelectTrigger
                          size="sm"
                          className="w-40"
                          aria-label={`${category.label}: срок хранения`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STORAGE_RETENTION_OPTIONS.map((days) => (
                            <SelectItem key={days} value={String(days)}>
                              {retentionLabel(days)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={locked}
                        onClick={() => setCleaning(category)}
                      >
                        <Trash2 />
                        Очистить…
                      </Button>
                    </div>
                    <p
                      className="text-xs text-muted-foreground"
                      data-testid={`due-${category.key}`}
                    >
                      {category.retentionDays === 0
                        ? 'Автоматически не удаляется.'
                        : category.due === 0
                          ? 'По сроку удалять нечего.'
                          : `По сроку при следующей очистке: ${formatNumber(category.due)} (≈ ${formatBytes(category.dueBytes)}).`}
                    </p>
                    {category.sensitive && manage && !sensitiveAllowed ? (
                      <p className="text-xs text-muted-foreground">
                        Нужно право «Журнал аудита и журнал безопасности».
                      </p>
                    ) : null}
                  </section>
                );
              })}
            </div>
          </div>
        )}
      </QueryBoundary>
      <CleanupDialog category={cleaning} onClose={() => setCleaning(null)} />
    </PermissionGate>
  );
}
