'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Award } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { AchievementIcon } from '@/components/achievements/achievement-icon';
import { RequireSession } from '@/components/auth/require-session';
import { Button, IconButton } from '@/components/ui/button';
import { CheckboxField } from '@/components/ui/checkbox';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { SkeletonRows } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { RARITY_LABEL, type AchievementRarity } from '@/lib/achievements/hooks';
import { api } from '@/lib/api/client';
import { getErrorMessage } from '@/lib/api/errors';

/// Витрина достижений (срез 5.7, часть 2, ADR-0136): до 10 полученных
/// достижений в выбранном порядке — показываются в профиле.

const MAX = 10;
const KEY = ['users', 'me', 'achievements'] as const;
const island = 'flex flex-col gap-4 rounded-xl bg-surface p-5 shadow-sm';

interface MyAchievement {
  achievement: {
    id: string;
    name: string;
    iconUrl: string;
    rarity: AchievementRarity;
  };
  isCompleted: boolean;
  isShowcased: boolean;
  showcaseOrder: number;
}

function Showcase() {
  const client = useQueryClient();
  const mine = useQuery({
    queryKey: KEY,
    queryFn: () => api.get<{ items: MyAchievement[] }>('/users/me/achievements'),
  });
  const [selected, setSelected] = useState<string[] | null>(null);
  // Начальный выбор — текущая витрина в её порядке.
  useEffect(() => {
    if (mine.data && selected === null) {
      setSelected(
        mine.data.items
          .filter((item) => item.isShowcased)
          .sort((a, b) => a.showcaseOrder - b.showcaseOrder)
          .map((item) => item.achievement.id),
      );
    }
  }, [mine.data, selected]);
  const save = useMutation({
    mutationFn: (achievementIds: string[]) =>
      api.post('/users/me/achievements/showcase', { achievementIds }),
    onSuccess: () => {
      toast.success('Витрина сохранена');
      return client.invalidateQueries({ queryKey: KEY });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  if (mine.isPending || selected === null) return <SkeletonRows rows={4} />;
  if (mine.isError) return <ErrorState error={mine.error} onRetry={() => mine.refetch()} />;
  const completed = mine.data.items.filter((item) => item.isCompleted);
  if (completed.length === 0) {
    return (
      <EmptyState
        icon={<Award />}
        title="Пока нечего показать"
        description="Получите достижение — и его можно будет добавить на витрину профиля."
        action={
          <Link href="/achievements" className="text-sm font-medium text-primary hover:underline">
            Все достижения
          </Link>
        }
      />
    );
  }
  const byId = new Map(completed.map((item) => [item.achievement.id, item.achievement]));
  const toggle = (id: string, on: boolean) =>
    setSelected((current) =>
      on ? [...(current ?? []), id] : (current ?? []).filter((item) => item !== id),
    );
  const move = (index: number, delta: number) =>
    setSelected((current) => {
      const next = [...(current ?? [])];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item!);
      return next;
    });

  return (
    <div className="flex flex-col gap-5">
      <section className={island} aria-label="Порядок на витрине">
        <h3 className="text-sm font-semibold">
          На витрине: {selected.length} из {MAX}
        </h3>
        {selected.length === 0 ? (
          <p className="text-sm text-muted-foreground">Отметьте достижения ниже.</p>
        ) : (
          <ol className="flex flex-col gap-2" data-testid="showcase-order">
            {selected.map((id, index) => {
              const achievement = byId.get(id);
              if (!achievement) return null;
              return (
                <li key={id} className="flex items-center gap-2 text-sm">
                  <span className="w-5 text-center text-xs text-muted-foreground">{index + 1}</span>
                  <AchievementIcon iconUrl={achievement.iconUrl} completed />
                  <span className="min-w-0 flex-1 truncate">{achievement.name}</span>
                  <IconButton
                    size="sm"
                    aria-label={`Выше: ${achievement.name}`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp />
                  </IconButton>
                  <IconButton
                    size="sm"
                    aria-label={`Ниже: ${achievement.name}`}
                    disabled={index === selected.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown />
                  </IconButton>
                </li>
              );
            })}
          </ol>
        )}
        <Button
          className="self-end"
          loading={save.isPending}
          onClick={() => save.mutate(selected.filter((id) => byId.has(id)))}
        >
          Сохранить витрину
        </Button>
      </section>
      <section className={island} aria-label="Полученные достижения">
        <h3 className="text-sm font-semibold">Полученные достижения</h3>
        <div className="grid gap-1 sm:grid-cols-2">
          {completed.map(({ achievement }) => {
            const checked = selected.includes(achievement.id);
            return (
              <CheckboxField
                key={achievement.id}
                label={achievement.name}
                description={RARITY_LABEL[achievement.rarity]}
                checked={checked}
                disabled={!checked && selected.length >= MAX}
                onCheckedChange={(value) => toggle(achievement.id, value === true)}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}

export default function ShowcaseSettingsPage() {
  return (
    <>
      <PageHeader
        title="Витрина"
        description="До 10 полученных достижений в выбранном порядке — их видят в вашем профиле."
      />
      <RequireSession>
        <Showcase />
      </RequireSession>
    </>
  );
}
