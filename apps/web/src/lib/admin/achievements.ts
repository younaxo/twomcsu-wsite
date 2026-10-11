'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { AchievementCategory, AchievementRarity } from '@/lib/achievements/hooks';

/// Достижения в админке (срез 7.6, ADR-0138): каталог, создание и правка,
/// удаление, пересчёт прогресса всех игроков.

export type AchievementConditionType =
  | 'PLAYTIME_MINUTES'
  | 'KILLS_COUNT'
  | 'DEATHS_COUNT'
  | 'FRIENDS_COUNT'
  | 'COMMENTS_COUNT'
  | 'LIKES_RECEIVED'
  | 'PURCHASES_COUNT'
  | 'TOTAL_SPENT'
  | 'GIFTS_SENT'
  | 'GIFTS_RECEIVED'
  | 'DAYS_STREAK'
  | 'ACCOUNT_AGE_DAYS'
  | 'PROFILE_VIEWS'
  | 'BADGES_COUNT'
  | 'REGISTRATION_ORDER'
  | 'BUG_REPORTED'
  | 'REPORTS_RESOLVED'
  | 'MANUAL'
  | 'CUSTOM';

/// Подписи условий. `kind`: counted — API считает прогресс сам; manual —
/// выдаётся только вручную; untracked — API это условие пока не считает
/// (выдать можно только вручную), это видно в форме. `inverted` — условие
/// «не больше значения».
export type ConditionKind = 'counted' | 'manual' | 'untracked';

export const CONDITION_META: Record<
  AchievementConditionType,
  { label: string; kind: ConditionKind; inverted?: true }
> = {
  PLAYTIME_MINUTES: { label: 'Минут в игре', kind: 'counted' },
  KILLS_COUNT: { label: 'Убийств', kind: 'counted' },
  DEATHS_COUNT: { label: 'Смертей', kind: 'counted' },
  FRIENDS_COUNT: { label: 'Друзей', kind: 'counted' },
  COMMENTS_COUNT: { label: 'Комментариев', kind: 'counted' },
  LIKES_RECEIVED: { label: 'Полученных лайков', kind: 'counted' },
  PURCHASES_COUNT: { label: 'Покупок', kind: 'counted' },
  TOTAL_SPENT: { label: 'Потрачено всего', kind: 'counted' },
  GIFTS_SENT: { label: 'Отправлено подарков', kind: 'counted' },
  GIFTS_RECEIVED: { label: 'Получено подарков', kind: 'counted' },
  ACCOUNT_AGE_DAYS: { label: 'Дней с регистрации', kind: 'counted' },
  BADGES_COUNT: { label: 'Значков', kind: 'counted' },
  REGISTRATION_ORDER: { label: 'Номер регистрации', kind: 'counted', inverted: true },
  BUG_REPORTED: { label: 'Сообщений о проблемах', kind: 'counted' },
  REPORTS_RESOLVED: { label: 'Решённых обращений', kind: 'counted' },
  MANUAL: { label: 'Ручная выдача', kind: 'manual' },
  DAYS_STREAK: { label: 'Дней подряд', kind: 'untracked' },
  PROFILE_VIEWS: { label: 'Просмотров профиля', kind: 'untracked' },
  CUSTOM: { label: 'Особое условие', kind: 'untracked' },
};

/// «Друзей ≥ 5», «Номер регистрации ≤ 100», «Ручная выдача».
export function conditionSummary(type: AchievementConditionType, value: number | null): string {
  const meta = CONDITION_META[type];
  if (meta.kind !== 'counted' || value === null) return meta.label;
  return `${meta.label} ${meta.inverted ? '≤' : '≥'} ${value}`;
}

export type UserBadgeType =
  'LEADERSHIP' | 'VERIFIED' | 'SUBSCRIBER_PLUS' | 'PROJECT_TEAM' | 'DEVELOPERS_TEAM';

export const BADGE_LABEL: Record<UserBadgeType, string> = {
  LEADERSHIP: 'Руководство',
  VERIFIED: 'Подтверждённый',
  SUBSCRIBER_PLUS: 'Подписчик+',
  PROJECT_TEAM: 'Команда проекта',
  DEVELOPERS_TEAM: 'Команда разработки',
};

export interface AdminAchievement {
  id: string;
  slug: string;
  name: string;
  description: string;
  iconUrl: string;
  category: AchievementCategory;
  rarity: AchievementRarity;
  isSecret: boolean;
  isActive: boolean;
  order: number;
  conditionType: AchievementConditionType;
  conditionValue: number | null;
  rewardBadgeType: string | null;
  rewardTitle: string | null;
  rewardMessage: string | null;
  unlockedCount: number;
}

/// Тело создания — поля `CreateAchievementDto`; при правке slug и тип
/// условия не меняются (API их не принимает).
export interface AchievementInput {
  slug: string;
  name: string;
  description: string;
  iconUrl: string;
  category: AchievementCategory;
  rarity: AchievementRarity;
  isSecret: boolean;
  isActive: boolean;
  order: number;
  conditionType: AchievementConditionType;
  conditionValue?: number;
  rewardBadgeType?: UserBadgeType | null;
  rewardTitle?: string | null;
  rewardMessage?: string | null;
}

export type AchievementPatch = Partial<Omit<AchievementInput, 'slug' | 'conditionType'>>;

export const adminAchievementKeys = {
  all: ['admin', 'achievements'] as const,
};

export function useAdminAchievements() {
  return useQuery({
    queryKey: adminAchievementKeys.all,
    queryFn: () => api.get<AdminAchievement[]>('/admin/achievements'),
  });
}

export function useAdminAchievementActions() {
  const client = useQueryClient();
  const onSuccess = () => client.invalidateQueries({ queryKey: adminAchievementKeys.all });
  const create = useMutation({
    mutationFn: (body: AchievementInput) => api.post<AdminAchievement>('/admin/achievements', body),
    onSuccess,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: AchievementPatch }) =>
      api.patch<AdminAchievement>(`/admin/achievements/${encodeURIComponent(id)}`, body),
    onSuccess,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/achievements/${encodeURIComponent(id)}`),
    onSuccess,
  });
  const checkAll = useMutation({
    mutationFn: () =>
      api.post<{ usersChecked: number; unlocksGranted: number }>(
        '/admin/achievements/check-all-users',
      ),
    onSuccess,
  });
  return { create, update, remove, checkAll };
}
