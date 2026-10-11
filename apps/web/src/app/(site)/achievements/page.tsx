'use client';

import { Award } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { AchievementIcon } from '@/components/achievements/achievement-icon';
import { ModuleGate } from '@/components/system/site-availability';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { inputClassName } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { SkeletonRows } from '@/components/ui/skeleton';
import {
  CATEGORY_LABEL,
  RARITY_LABEL,
  useAchievements,
  type AchievementCategory,
  type AchievementFilter,
} from '@/lib/achievements/hooks';
import { useAuthStore } from '@/lib/auth/store';

/// Достижения (срез 5.7, ADR-0129): категории, прогресс для вошедших,
/// «Полученные / Не полученные». Секретные появляются после получения.

function AchievementsContent() {
  const signedIn = useAuthStore((state) => state.status === 'authenticated');
  const [category, setCategory] = useState<AchievementCategory | 'ALL'>('ALL');
  const [filter, setFilter] = useState<AchievementFilter>('all');
  const list = useAchievements(category, signedIn ? filter : 'all', signedIn);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-8 md:px-6">
      <PageHeader title="Достижения" description="Награды за игру и жизнь сообщества twomc.su." />
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Категория"
          className={`${inputClassName} w-auto`}
          value={category}
          onChange={(event) => setCategory(event.target.value as AchievementCategory | 'ALL')}
        >
          <option value="ALL">Все категории</option>
          {(Object.keys(CATEGORY_LABEL) as AchievementCategory[]).map((key) => (
            <option key={key} value={key}>
              {CATEGORY_LABEL[key]}
            </option>
          ))}
        </select>
        {signedIn ? (
          <SegmentedControl
            aria-label="Показать"
            options={[
              { value: 'all', label: 'Все' },
              { value: 'completed', label: 'Полученные' },
              { value: 'incomplete', label: 'Не полученные' },
            ]}
            value={filter}
            onValueChange={(value) => setFilter(value as AchievementFilter)}
          />
        ) : null}
      </div>
      {list.isPending ? (
        <SkeletonRows rows={5} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.data.length === 0 ? (
        <EmptyState
          icon={<Award />}
          title="Достижений нет"
          description={
            filter === 'completed'
              ? 'Вы пока не получили достижений в этой категории.'
              : 'Здесь появятся достижения, когда администрация их добавит.'
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2" data-testid="achievements-list">
          {list.data.map((achievement) => {
            const target = achievement.conditionValue ?? 0;
            return (
              <li key={achievement.id}>
                <Link
                  href={`/achievements/${encodeURIComponent(achievement.slug)}`}
                  className="flex h-full gap-3 rounded-xl bg-surface p-4 shadow-sm hover:bg-muted/40"
                >
                  <AchievementIcon
                    iconUrl={achievement.iconUrl}
                    completed={achievement.isCompleted}
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-sm font-medium">{achievement.name}</span>
                    <span className="line-clamp-2 text-xs text-muted-foreground">
                      {achievement.description}
                    </span>
                    <div className="flex flex-wrap gap-1">
                      <Badge tone="neutral">{RARITY_LABEL[achievement.rarity]}</Badge>
                      {achievement.isCompleted ? <Badge tone="success">Получено</Badge> : null}
                    </div>
                    {signedIn && !achievement.isCompleted && target > 1 ? (
                      <div className="flex items-center gap-2">
                        <Progress
                          size="sm"
                          value={Math.min(100, (achievement.currentProgress / target) * 100)}
                          label="Прогресс достижения"
                        />
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {achievement.currentProgress} из {target}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/// Страница модуля «achievements» (ADR-0082): выключен или на техработах — понятное состояние.
export default function AchievementsPage() {
  return (
    <ModuleGate module="achievements">
      <AchievementsContent />
    </ModuleGate>
  );
}
