'use client';

import { Award } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AchievementIcon } from '@/components/achievements/achievement-icon';
import { ModuleGate } from '@/components/system/site-availability';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Progress } from '@/components/ui/progress';
import { SkeletonRows } from '@/components/ui/skeleton';
import { CATEGORY_LABEL, RARITY_LABEL, rewardText, useAchievement } from '@/lib/achievements/hooks';
import { ApiError } from '@/lib/api/errors';
import { useAuthStore } from '@/lib/auth/store';
import { formatDateTime, formatNumber, plural } from '@/lib/format';

/// Карточка достижения (срез 5.7, ADR-0129): описание, редкость, награда,
/// сколько игроков получили, прогресс или дата получения для вошедшего.
function AchievementContent() {
  const { slug } = useParams<{ slug: string }>();
  const signedIn = useAuthStore((state) => state.status === 'authenticated');
  const achievement = useAchievement(slug, signedIn);
  if (achievement.isPending) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-8">
        <SkeletonRows rows={4} />
      </div>
    );
  }
  if (achievement.isError) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-8">
        {achievement.error instanceof ApiError && achievement.error.status === 404 ? (
          <EmptyState
            icon={<Award />}
            title="Достижение не найдено"
            description="Возможно, оно секретное или отключено."
            action={
              <Link
                href="/achievements"
                className="text-sm font-medium text-primary hover:underline"
              >
                Все достижения
              </Link>
            }
          />
        ) : (
          <ErrorState error={achievement.error} onRetry={() => achievement.refetch()} />
        )}
      </div>
    );
  }
  const data = achievement.data;
  const target = data.conditionValue ?? 0;
  const reward = rewardText(data);
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-8 md:px-6">
      <Link href="/achievements" className="text-sm text-muted-foreground hover:underline">
        ← Все достижения
      </Link>
      <section
        className="flex flex-col items-center gap-3 rounded-xl bg-surface p-6 text-center shadow-sm"
        data-testid="achievement"
      >
        <AchievementIcon iconUrl={data.iconUrl} completed={data.isCompleted} size="lg" />
        <h1 className="font-display text-2xl font-bold">{data.name}</h1>
        <div className="flex flex-wrap justify-center gap-1.5">
          <Badge tone="neutral">{CATEGORY_LABEL[data.category]}</Badge>
          <Badge tone="primary">{RARITY_LABEL[data.rarity]}</Badge>
          {data.isCompleted ? <Badge tone="success">Получено</Badge> : null}
        </div>
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">{data.description}</p>
        {reward ? <p className="text-sm">Награда: {reward}</p> : null}
        <p className="text-xs text-subtle-foreground">
          Получили {formatNumber(data.unlockedCount)}{' '}
          {plural(data.unlockedCount, { one: 'игрок', few: 'игрока', many: 'игроков' })}
        </p>
        {data.isCompleted && data.completedAt ? (
          <p className="text-xs text-subtle-foreground">
            Вы получили {formatDateTime(data.completedAt)}
          </p>
        ) : signedIn && target > 1 ? (
          <div className="flex w-full max-w-xs items-center gap-2">
            <Progress
              value={Math.min(100, (data.currentProgress / target) * 100)}
              label="Прогресс достижения"
            />
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {data.currentProgress} из {target}
            </span>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export default function AchievementPage() {
  return (
    <ModuleGate module="achievements">
      <AchievementContent />
    </ModuleGate>
  );
}
