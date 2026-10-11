'use client';

import { Plus, Trophy } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { PermissionGate } from '@/components/admin/permission-gate';
import { AchievementIcon } from '@/components/achievements/achievement-icon';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckboxField } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Field } from '@/components/ui/field';
import { Input, Textarea, inputClassName } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import {
  AWARD_RARITY_LABEL,
  useAdminAwardActions,
  useAdminAwards,
  type AdminAward,
  type AwardInput,
  type AwardRarity,
} from '@/lib/admin/awards';
import { getErrorMessage } from '@/lib/api/errors';
import { usePermissions } from '@/lib/auth/use-permissions';

/// Награды в админке (срез 7.6, ADR-0139): каталог, создание и правка,
/// удаление с подтверждением (награда снимается у всех обладателей).
/// Каждое действие — по своему праву `awards.*`.

const SLUG = /^[a-z0-9-]+$/;

function isRarity(value: string | null): value is AwardRarity {
  return value !== null && value in AWARD_RARITY_LABEL;
}

function AwardDialog({
  award,
  open,
  onOpenChange,
}: {
  award: AdminAward | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { create, update } = useAdminAwardActions();
  const [form, setForm] = useState(() => ({
    name: award?.name ?? '',
    slug: award?.slug ?? '',
    description: award?.description ?? '',
    iconUrl: award?.iconUrl ?? '',
    rarity: (isRarity(award?.rarity ?? null) ? award!.rarity : '') as AwardRarity | '',
    isActive: award?.isActive ?? true,
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = 'Введите название';
    if (!award && !SLUG.test(form.slug)) {
      next.slug = 'Только строчные латинские буквы, цифры и дефис';
    }
    if (!form.iconUrl.trim()) next.iconUrl = 'Укажите ссылку на иконку';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const done = {
      onSuccess: () => {
        toast.success(award ? 'Награда сохранена' : 'Награда создана');
        onOpenChange(false);
      },
      onError: (error: unknown) => toast.error(getErrorMessage(error)),
    };
    if (award) {
      update.mutate(
        {
          id: award.id,
          body: {
            name: form.name.trim(),
            description: form.description.trim() || null,
            iconUrl: form.iconUrl.trim(),
            rarity: form.rarity || null,
            isActive: form.isActive,
          },
        },
        done,
      );
    } else {
      const body: AwardInput = {
        name: form.name.trim(),
        slug: form.slug,
        iconUrl: form.iconUrl.trim(),
        ...(form.description.trim() ? { description: form.description.trim() } : {}),
        ...(form.rarity ? { rarity: form.rarity } : {}),
      };
      create.mutate(body, done);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>{award ? 'Изменить награду' : 'Новая награда'}</DialogTitle>
          </DialogHeader>
          <DialogBody className="grid gap-3 sm:grid-cols-2">
            <Field label="Название" required error={errors.name}>
              <Input
                value={form.name}
                maxLength={100}
                onChange={(e) => set({ name: e.target.value })}
              />
            </Field>
            {award ? null : (
              <Field label="Slug" required error={errors.slug} hint="Потом не меняется">
                <Input
                  value={form.slug}
                  maxLength={160}
                  spellCheck={false}
                  onChange={(e) => set({ slug: e.target.value.toLowerCase() })}
                />
              </Field>
            )}
            <Field
              label="Иконка"
              required
              error={errors.iconUrl}
              hint="Ссылка на картинку (CDN)"
              className="sm:col-span-2"
            >
              <Input
                value={form.iconUrl}
                maxLength={500}
                spellCheck={false}
                onChange={(e) => set({ iconUrl: e.target.value })}
              />
            </Field>
            <Field label="Редкость" hint="Задаёт рамку в профиле">
              <select
                className={inputClassName}
                value={form.rarity}
                onChange={(e) => set({ rarity: e.target.value as AwardRarity | '' })}
              >
                <option value="">Не указана</option>
                {Object.entries(AWARD_RARITY_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Описание" className="sm:col-span-2">
              <Textarea
                value={form.description}
                maxLength={500}
                rows={3}
                onChange={(e) => set({ description: e.target.value })}
              />
            </Field>
            {award ? (
              <CheckboxField
                label="Показывать на сайте"
                checked={form.isActive}
                onCheckedChange={(checked) => set({ isActive: checked === true })}
              />
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" loading={create.isPending || update.isPending}>
              Сохранить
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AwardsList() {
  const { can } = usePermissions();
  const awards = useAdminAwards();
  const { remove } = useAdminAwardActions();
  const [editing, setEditing] = useState<AdminAward | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<AdminAward | null>(null);

  return (
    <>
      {can('awards.create') ? (
        <Button className="self-start" onClick={() => setEditing(null)}>
          <Plus />
          Добавить награду
        </Button>
      ) : null}
      {awards.isPending ? (
        <SkeletonRows rows={4} />
      ) : awards.isError ? (
        <ErrorState error={awards.error} onRetry={() => awards.refetch()} />
      ) : awards.data.length === 0 ? (
        <EmptyState icon={<Trophy />} title="Наград пока нет" />
      ) : (
        <ul
          className="flex flex-col divide-y divide-border-subtle rounded-xl bg-surface shadow-sm"
          data-testid="admin-awards"
        >
          {awards.data.map((award) => (
            <li key={award.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <AchievementIcon iconUrl={award.iconUrl} completed />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-medium">{award.name}</span>
                  {isRarity(award.rarity) ? (
                    <Badge tone="neutral">{AWARD_RARITY_LABEL[award.rarity]}</Badge>
                  ) : null}
                  {award.isActive ? null : <Badge tone="warning">Скрыта</Badge>}
                </div>
                <span className="text-xs text-muted-foreground">
                  У игроков: {award.holdersCount}
                </span>
              </div>
              <span className="flex gap-1">
                {can('awards.edit') ? (
                  <Button size="sm" variant="secondary" onClick={() => setEditing(award)}>
                    Изменить
                  </Button>
                ) : null}
                {can('awards.delete') ? (
                  <Button size="sm" variant="ghost" onClick={() => setDeleting(award)}>
                    Удалить
                  </Button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
      {editing !== undefined ? (
        <AwardDialog
          key={editing?.id ?? 'new'}
          award={editing}
          open
          onOpenChange={(open) => !open && setEditing(undefined)}
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Удалить награду «${deleting?.name ?? ''}»?`}
        description={`Награда пропадёт у всех обладателей (${deleting?.holdersCount ?? 0}). Действие необратимо.`}
        confirmLabel="Удалить"
        destructive
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(deleting!.id, {
            onSuccess: () => {
              toast.success('Награда удалена');
              setDeleting(null);
            },
            onError: (error) => toast.error(getErrorMessage(error)),
          })
        }
      />
    </>
  );
}

export default function AdminAwardsPage() {
  return (
    <PermissionGate requirement="awards.view">
      <div className="flex flex-col gap-4">
        <PageHeader title="Награды" description="Награды, которые выдаёт администрация." />
        <AwardsList />
      </div>
    </PermissionGate>
  );
}
