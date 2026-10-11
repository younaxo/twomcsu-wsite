'use client';

import { Award, Plus, RefreshCw } from 'lucide-react';
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
  CATEGORY_LABEL,
  RARITY_LABEL,
  type AchievementCategory,
  type AchievementRarity,
} from '@/lib/achievements/hooks';
import {
  BADGE_LABEL,
  CONDITION_META,
  conditionSummary,
  useAdminAchievementActions,
  useAdminAchievements,
  type AchievementConditionType,
  type AchievementInput,
  type AdminAchievement,
  type UserBadgeType,
} from '@/lib/admin/achievements';
import { getErrorMessage } from '@/lib/api/errors';
import { usePermissions } from '@/lib/auth/use-permissions';

/// Достижения в админке (срез 7.6, ADR-0138): каталог, создание и правка,
/// удаление с подтверждением, пересчёт прогресса всех игроков. Каждое
/// действие — по своему праву `achievements.*`.

const SLUG = /^[a-z0-9-]+$/;
const digits = (value: string) => value.replace(/\D/g, '');

function emptyForm(achievement?: AdminAchievement) {
  return {
    name: achievement?.name ?? '',
    slug: achievement?.slug ?? '',
    description: achievement?.description ?? '',
    iconUrl: achievement?.iconUrl ?? '',
    category: achievement?.category ?? ('GAME' as AchievementCategory),
    rarity: achievement?.rarity ?? ('COMMON' as AchievementRarity),
    conditionType: achievement?.conditionType ?? ('MANUAL' as AchievementConditionType),
    conditionValue:
      achievement?.conditionValue !== null && achievement?.conditionValue !== undefined
        ? String(achievement.conditionValue)
        : '',
    order: String(achievement?.order ?? 0),
    rewardBadgeType: (achievement?.rewardBadgeType ?? '') as UserBadgeType | '',
    rewardTitle: achievement?.rewardTitle ?? '',
    rewardMessage: achievement?.rewardMessage ?? '',
    isSecret: achievement?.isSecret ?? false,
    isActive: achievement?.isActive ?? true,
  };
}

function AchievementDialog({
  achievement,
  open,
  onOpenChange,
}: {
  achievement: AdminAchievement | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { create, update } = useAdminAchievementActions();
  const [form, setForm] = useState(() => emptyForm(achievement ?? undefined));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));
  const meta = CONDITION_META[form.conditionType];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = 'Введите название';
    if (!achievement && !SLUG.test(form.slug)) {
      next.slug = 'Только строчные латинские буквы, цифры и дефис';
    }
    if (!form.description.trim()) next.description = 'Введите описание';
    if (!form.iconUrl.trim()) next.iconUrl = 'Укажите ссылку на иконку';
    const value = Number(form.conditionValue);
    if (meta.kind === 'counted' && !(value >= 1)) next.conditionValue = 'Число от 1';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const common = {
      name: form.name.trim(),
      description: form.description.trim(),
      iconUrl: form.iconUrl.trim(),
      category: form.category,
      rarity: form.rarity,
      isSecret: form.isSecret,
      isActive: form.isActive,
      order: Number(form.order) || 0,
      ...(meta.kind === 'counted' ? { conditionValue: value } : {}),
    };
    const done = {
      onSuccess: () => {
        toast.success(achievement ? 'Достижение сохранено' : 'Достижение создано');
        onOpenChange(false);
      },
      onError: (error: unknown) => toast.error(getErrorMessage(error)),
    };
    if (achievement) {
      // При правке пустые поля награды очищаются (null), а не остаются прежними.
      update.mutate(
        {
          id: achievement.id,
          body: {
            ...common,
            rewardBadgeType: form.rewardBadgeType || null,
            rewardTitle: form.rewardTitle.trim() || null,
            rewardMessage: form.rewardMessage.trim() || null,
          },
        },
        done,
      );
    } else {
      const body: AchievementInput = {
        ...common,
        slug: form.slug,
        conditionType: form.conditionType,
        ...(form.rewardBadgeType ? { rewardBadgeType: form.rewardBadgeType } : {}),
        ...(form.rewardTitle.trim() ? { rewardTitle: form.rewardTitle.trim() } : {}),
        ...(form.rewardMessage.trim() ? { rewardMessage: form.rewardMessage.trim() } : {}),
      };
      create.mutate(body, done);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>{achievement ? 'Изменить достижение' : 'Новое достижение'}</DialogTitle>
          </DialogHeader>
          <DialogBody className="grid gap-3 sm:grid-cols-2">
            <Field label="Название" required error={errors.name}>
              <Input
                value={form.name}
                maxLength={200}
                onChange={(e) => set({ name: e.target.value })}
              />
            </Field>
            {achievement ? null : (
              <Field
                label="Slug"
                required
                error={errors.slug}
                hint="Адрес: /achievements/slug, потом не меняется"
              >
                <Input
                  value={form.slug}
                  maxLength={160}
                  spellCheck={false}
                  onChange={(e) => set({ slug: e.target.value.toLowerCase() })}
                />
              </Field>
            )}
            <Field label="Описание" required error={errors.description} className="sm:col-span-2">
              <Textarea
                value={form.description}
                maxLength={2000}
                rows={3}
                onChange={(e) => set({ description: e.target.value })}
              />
            </Field>
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
            <Field label="Категория">
              <select
                className={inputClassName}
                value={form.category}
                onChange={(e) => set({ category: e.target.value as AchievementCategory })}
              >
                {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Редкость">
              <select
                className={inputClassName}
                value={form.rarity}
                onChange={(e) => set({ rarity: e.target.value as AchievementRarity })}
              >
                {Object.entries(RARITY_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Условие"
              hint={
                achievement
                  ? 'Тип условия не меняется — для другого условия создайте новое достижение'
                  : meta.kind === 'untracked'
                    ? 'Это условие пока не считается автоматически — выдать можно только вручную'
                    : undefined
              }
            >
              <select
                className={inputClassName}
                value={form.conditionType}
                disabled={!!achievement}
                onChange={(e) => set({ conditionType: e.target.value as AchievementConditionType })}
              >
                {Object.entries(CONDITION_META).map(([value, item]) => (
                  <option key={value} value={value}>
                    {item.label}
                    {item.inverted ? ' (не больше)' : ''}
                    {item.kind === 'untracked' ? ' — пока не считается' : ''}
                  </option>
                ))}
              </select>
            </Field>
            {meta.kind === 'counted' ? (
              <Field label="Значение" required error={errors.conditionValue}>
                <Input
                  inputMode="numeric"
                  value={form.conditionValue}
                  onChange={(e) => set({ conditionValue: digits(e.target.value) })}
                />
              </Field>
            ) : null}
            <Field label="Порядок">
              <Input
                inputMode="numeric"
                value={form.order}
                onChange={(e) => set({ order: digits(e.target.value) })}
              />
            </Field>
            <Field label="Значок в награду">
              <select
                className={inputClassName}
                value={form.rewardBadgeType}
                onChange={(e) => set({ rewardBadgeType: e.target.value as UserBadgeType | '' })}
              >
                <option value="">Без значка</option>
                {Object.entries(BADGE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Титул в награду" className="sm:col-span-2">
              <Input
                value={form.rewardTitle}
                maxLength={200}
                onChange={(e) => set({ rewardTitle: e.target.value })}
              />
            </Field>
            <Field label="Сообщение при получении" className="sm:col-span-2">
              <Textarea
                value={form.rewardMessage}
                maxLength={1000}
                rows={2}
                onChange={(e) => set({ rewardMessage: e.target.value })}
              />
            </Field>
            <CheckboxField
              label="Секретное — условие скрыто до получения"
              checked={form.isSecret}
              onCheckedChange={(checked) => set({ isSecret: checked === true })}
            />
            <CheckboxField
              label="Показывать на сайте"
              checked={form.isActive}
              onCheckedChange={(checked) => set({ isActive: checked === true })}
            />
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

function AchievementsList() {
  const { can } = usePermissions();
  const achievements = useAdminAchievements();
  const { remove, checkAll } = useAdminAchievementActions();
  const [editing, setEditing] = useState<AdminAchievement | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<AdminAchievement | null>(null);
  const [confirmCheck, setConfirmCheck] = useState(false);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {can('achievements.create') ? (
          <Button onClick={() => setEditing(null)}>
            <Plus />
            Добавить достижение
          </Button>
        ) : null}
        {can('achievements.check_all_users.create') ? (
          <Button variant="secondary" onClick={() => setConfirmCheck(true)}>
            <RefreshCw />
            Пересчитать прогресс
          </Button>
        ) : null}
      </div>
      {achievements.isPending ? (
        <SkeletonRows rows={5} />
      ) : achievements.isError ? (
        <ErrorState error={achievements.error} onRetry={() => achievements.refetch()} />
      ) : achievements.data.length === 0 ? (
        <EmptyState icon={<Award />} title="Достижений пока нет" />
      ) : (
        <ul
          className="flex flex-col divide-y divide-border-subtle rounded-xl bg-surface shadow-sm"
          data-testid="admin-achievements"
        >
          {achievements.data.map((achievement) => (
            <li key={achievement.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <AchievementIcon iconUrl={achievement.iconUrl} completed />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-medium">{achievement.name}</span>
                  <Badge tone="neutral">{RARITY_LABEL[achievement.rarity]}</Badge>
                  <Badge tone="neutral">{CATEGORY_LABEL[achievement.category]}</Badge>
                  {achievement.isSecret ? <Badge tone="neutral">Секретное</Badge> : null}
                  {achievement.isActive ? null : <Badge tone="warning">Скрыто</Badge>}
                </div>
                <span className="text-xs text-muted-foreground">
                  {conditionSummary(achievement.conditionType, achievement.conditionValue)} ·
                  получили: {achievement.unlockedCount}
                </span>
              </div>
              <span className="flex gap-1">
                {can('achievements.edit') ? (
                  <Button size="sm" variant="secondary" onClick={() => setEditing(achievement)}>
                    Изменить
                  </Button>
                ) : null}
                {can('achievements.delete') ? (
                  <Button size="sm" variant="ghost" onClick={() => setDeleting(achievement)}>
                    Удалить
                  </Button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
      {editing !== undefined ? (
        <AchievementDialog
          key={editing?.id ?? 'new'}
          achievement={editing}
          open
          onOpenChange={(open) => !open && setEditing(undefined)}
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Удалить достижение «${deleting?.name ?? ''}»?`}
        description="У игроков, которые его получили, оно пропадёт вместе с прогрессом. Действие необратимо."
        confirmLabel="Удалить"
        destructive
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(deleting!.id, {
            onSuccess: () => {
              toast.success('Достижение удалено');
              setDeleting(null);
            },
            onError: (error) => toast.error(getErrorMessage(error)),
          })
        }
      />
      <ConfirmDialog
        open={confirmCheck}
        onOpenChange={setConfirmCheck}
        title="Пересчитать прогресс всех игроков?"
        description="Условия проверятся у каждого игрока, новые достижения выдадутся с уведомлением. На большой базе это занимает время."
        confirmLabel="Пересчитать"
        loading={checkAll.isPending}
        onConfirm={() =>
          checkAll.mutate(undefined, {
            onSuccess: (result) => {
              toast.success(
                `Проверено игроков: ${result.usersChecked}, выдано достижений: ${result.unlocksGranted}`,
              );
              setConfirmCheck(false);
            },
            onError: (error) => toast.error(getErrorMessage(error)),
          })
        }
      />
    </>
  );
}

export default function AdminAchievementsPage() {
  return (
    <PermissionGate requirement="achievements.view">
      <div className="flex flex-col gap-4">
        <PageHeader title="Достижения" description="Каталог достижений и их условия." />
        <AchievementsList />
      </div>
    </PermissionGate>
  );
}
