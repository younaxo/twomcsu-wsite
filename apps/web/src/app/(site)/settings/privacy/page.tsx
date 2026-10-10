'use client';

import type { OwnProfileDto, UpdateOwnProfileRequest } from '@twomc/shared';
import { PageHeader } from '@/components/admin/page-header';
import { QueryBoundary } from '@/components/admin/query-boundary';
import { RequireSession } from '@/components/auth/require-session';
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
import { useOwnProfile, useUpdateProfile } from '@/lib/account/hooks';
import { getErrorMessage } from '@/lib/api/errors';

const island = 'flex flex-col gap-3 rounded-xl bg-surface p-5 shadow-sm';

type PolicyKey =
  'profileVisibility' | 'friendRequestPolicy' | 'directMessagePolicy' | 'commentPolicy';
type FlagKey = {
  [K in keyof OwnProfileDto]: OwnProfileDto[K] extends boolean ? K : never;
}[keyof OwnProfileDto];

const POLICIES: { key: PolicyKey; label: string; options: { value: string; label: string }[] }[] = [
  {
    key: 'profileVisibility',
    label: 'Кто видит профиль',
    options: [
      { value: 'EVERYONE', label: 'Все' },
      { value: 'FRIENDS_ONLY', label: 'Только друзья' },
      { value: 'NOBODY', label: 'Никто' },
    ],
  },
  {
    key: 'friendRequestPolicy',
    label: 'Кто может добавить в друзья',
    options: [
      { value: 'EVERYONE', label: 'Все' },
      { value: 'FRIENDS_OF_FRIENDS', label: 'Друзья друзей' },
      { value: 'NOBODY', label: 'Никто' },
    ],
  },
  {
    key: 'directMessagePolicy',
    label: 'Кто может писать в личные сообщения',
    options: [
      { value: 'EVERYONE', label: 'Все' },
      { value: 'FRIENDS_OF_FRIENDS', label: 'Друзья друзей' },
      { value: 'FRIENDS', label: 'Только друзья' },
      { value: 'NOBODY', label: 'Никто' },
    ],
  },
  {
    key: 'commentPolicy',
    label: 'Кто может комментировать профиль',
    options: [
      { value: 'EVERYONE', label: 'Все' },
      { value: 'FRIENDS_OF_FRIENDS', label: 'Друзья друзей' },
      { value: 'FRIENDS', label: 'Только друзья' },
      { value: 'NOBODY', label: 'Никто' },
    ],
  },
];

const HIDE_FLAGS: { key: FlagKey; label: string }[] = [
  { key: 'hideEmail', label: 'Скрыть e-mail' },
  { key: 'hideCountry', label: 'Скрыть страну' },
  { key: 'hideCity', label: 'Скрыть город' },
  { key: 'hideBirthDate', label: 'Скрыть дату рождения' },
  { key: 'hideGender', label: 'Скрыть пол' },
  { key: 'hideStatistics', label: 'Скрыть игровую статистику' },
  { key: 'hideSocials', label: 'Скрыть соцсети' },
  { key: 'commentsEnabled', label: 'Комментарии в профиле включены' },
];

const NOTIFY_FLAGS: { key: FlagKey; label: string }[] = [
  { key: 'notifyOnComment', label: 'Новый комментарий в профиле' },
  { key: 'notifyOnReply', label: 'Ответ на мой комментарий' },
  { key: 'notifyOnMention', label: 'Упоминание' },
  { key: 'notifyOnFriendRequest', label: 'Заявка в друзья' },
  { key: 'notifyOnGift', label: 'Подарок' },
  { key: 'notifyOnOrder', label: 'Статус заказа' },
];

/// Каждое изменение сохраняется сразу (переключатель или выбор) — без кнопки.
function PrivacyEditor({ profile }: { profile: OwnProfileDto }) {
  const update = useUpdateProfile();
  const save = async (patch: UpdateOwnProfileRequest) => {
    try {
      await update.mutateAsync(patch);
      toast.success('Сохранено');
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };
  const flag = ({ key, label }: { key: FlagKey; label: string }) => (
    <SwitchField
      key={key}
      label={label}
      checked={profile[key]}
      disabled={update.isPending}
      onCheckedChange={(value) => void save({ [key]: value })}
    />
  );
  return (
    <div className="flex flex-col gap-5">
      <section className={island} aria-label="Кто что может">
        <h3 className="text-sm font-semibold">Доступ</h3>
        {POLICIES.map((policy) => (
          <div key={policy.key} className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm">{policy.label}</span>
            <Select
              value={profile[policy.key]}
              disabled={update.isPending}
              onValueChange={(value) => void save({ [policy.key]: value })}
            >
              <SelectTrigger className="w-52" aria-label={policy.label}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {policy.options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </section>
      <section className={island} aria-label="Что показывать">
        <h3 className="text-sm font-semibold">Что показывать в профиле</h3>
        {HIDE_FLAGS.map(flag)}
      </section>
      <section className={island} aria-label="Уведомления профиля">
        <h3 className="text-sm font-semibold">Уведомлять меня</h3>
        {NOTIFY_FLAGS.map(flag)}
      </section>
    </div>
  );
}

/// «Настройки → Приватность».
export default function PrivacySettingsPage() {
  const query = useOwnProfile();
  return (
    <>
      <PageHeader
        title="Приватность"
        description="Кто видит профиль и может с вами связаться, какие уведомления получать."
      />
      <RequireSession>
        <QueryBoundary query={query} skeleton={<SkeletonRows rows={6} />}>
          {(profile) => <PrivacyEditor profile={profile} />}
        </QueryBoundary>
      </RequireSession>
    </>
  );
}
