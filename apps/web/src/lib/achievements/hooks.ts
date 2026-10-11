'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { plural } from '@/lib/format';

/// Достижения (срез 5.7, ADR-0129): каталог с прогрессом вошедшего и карточка.
/// Секретные видны только после получения (решает API).

export type AchievementCategory = 'GAME' | 'SOCIAL' | 'DONATION' | 'SPECIAL' | 'DAILY' | 'SECRET';
export type AchievementRarity = 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY' | 'MYTHIC';

export const CATEGORY_LABEL: Record<AchievementCategory, string> = {
  GAME: 'Игра',
  SOCIAL: 'Сообщество',
  DONATION: 'Поддержка',
  SPECIAL: 'Особые',
  DAILY: 'Ежедневные',
  SECRET: 'Секретные',
};

export const RARITY_LABEL: Record<AchievementRarity, string> = {
  COMMON: 'Обычное',
  RARE: 'Редкое',
  EPIC: 'Эпическое',
  LEGENDARY: 'Легендарное',
  MYTHIC: 'Мифическое',
};

export interface AchievementDto {
  id: string;
  slug: string;
  name: string;
  description: string;
  iconUrl: string;
  category: AchievementCategory;
  rarity: AchievementRarity;
  isSecret: boolean;
  conditionValue: number | null;
  rewardRubies: number;
  rewardTitle: string | null;
  unlockedCount: number;
  currentProgress: number;
  isCompleted: boolean;
  completedAt: string | null;
}

export type AchievementFilter = 'all' | 'completed' | 'incomplete';

export function useAchievements(
  category: AchievementCategory | 'ALL',
  filter: AchievementFilter,
  signedIn: boolean,
) {
  return useQuery({
    queryKey: ['achievements', 'list', category, filter, signedIn],
    queryFn: () =>
      api.get<AchievementDto[]>('/achievements', {
        query: {
          ...(category === 'ALL' ? {} : { category }),
          ...(filter === 'all' ? {} : { filter }),
        },
      }),
  });
}

export function useAchievement(slug: string, signedIn: boolean) {
  return useQuery({
    queryKey: ['achievements', 'one', slug, signedIn],
    queryFn: () => api.get<AchievementDto>(`/achievements/${encodeURIComponent(slug)}`),
    retry: false,
  });
}

/// Иконку задаёт администрация: только http(s) или путь сайта.
export const safeIcon = (url: string) =>
  /^https?:\/\//i.test(url) || (url.startsWith('/') && !url.startsWith('//')) ? url : null;

export const rewardText = (achievement: Pick<AchievementDto, 'rewardRubies' | 'rewardTitle'>) =>
  [
    achievement.rewardRubies > 0
      ? `+${achievement.rewardRubies} ${plural(achievement.rewardRubies, { one: 'рубин', few: 'рубина', many: 'рубинов' })}`
      : null,
    achievement.rewardTitle ? `титул «${achievement.rewardTitle}»` : null,
  ]
    .filter(Boolean)
    .join(', ');
