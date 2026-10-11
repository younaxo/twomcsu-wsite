'use client';

import { useQuery } from '@tanstack/react-query';
import { Trophy } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { ModuleGate } from '@/components/system/site-availability';
import { Avatar } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { SkeletonRows } from '@/components/ui/skeleton';
import { api } from '@/lib/api/client';
import { cn } from '@/lib/cn';
import { formatNumber, plural } from '@/lib/format';

/// Рейтинги (срез 5.8, ADR-0127): топ-10 по времени в игре, убийствам,
/// монетам, достижениям и покупкам. Игроки со скрытой статистикой или
/// закрытым профилем в рейтинг не попадают (решает API).

interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  avatar: string | null;
  value: number;
}

type Board = 'playtime' | 'kills' | 'coins' | 'achievements' | 'purchases';

const BOARDS: Record<
  Board,
  { label: string; format: (value: number) => string; empty: string; gameData?: boolean }
> = {
  playtime: {
    label: 'Время в игре',
    format: (minutes) => `${formatNumber(Math.floor(minutes / 60))} ч ${minutes % 60} мин`,
    empty: 'Статистика из игры появится, когда сервер начнёт её присылать.',
    gameData: true,
  },
  kills: {
    label: 'Убийства',
    format: (value) => formatNumber(value),
    empty: 'Статистика из игры появится, когда сервер начнёт её присылать.',
    gameData: true,
  },
  coins: {
    label: 'Монеты',
    format: (value) =>
      `${formatNumber(value)} ${plural(value, { one: 'монета', few: 'монеты', many: 'монет' })}`,
    empty: 'Монеты начисляются за голосование за сервер.',
  },
  achievements: {
    label: 'Достижения',
    format: (value) => formatNumber(value),
    empty: 'Пока никто не получил достижений.',
  },
  purchases: {
    label: 'Покупки',
    format: (value) =>
      `${formatNumber(value)} ${plural(value, { one: 'заказ', few: 'заказа', many: 'заказов' })}`,
    empty: 'Пока нет завершённых заказов.',
  },
};

function LeaderboardsContent() {
  const [board, setBoard] = useState<Board>('playtime');
  const data = useQuery({
    queryKey: ['leaderboards'],
    queryFn: () => api.get<Record<Board, LeaderboardEntry[]>>('/leaderboards', { auth: false }),
    staleTime: 60_000,
  });
  const meta = BOARDS[board];
  const entries = data.data?.[board] ?? [];
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-8 md:px-6">
      <PageHeader title="Рейтинги" description="Лучшие игроки twomc.su." />
      <SegmentedControl
        aria-label="Рейтинг"
        options={(Object.keys(BOARDS) as Board[]).map((key) => ({
          value: key,
          label: BOARDS[key].label,
        }))}
        value={board}
        onValueChange={(value) => setBoard(value as Board)}
        className="self-start overflow-x-auto"
      />
      {data.isPending ? (
        <SkeletonRows rows={5} />
      ) : data.isError ? (
        <ErrorState error={data.error} onRetry={() => data.refetch()} />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={<Trophy />}
          title="Рейтинг пока пуст"
          description={meta.empty}
          action={
            board === 'coins' ? (
              <Link href="/vote" className="text-sm font-medium text-primary hover:underline">
                Голосование
              </Link>
            ) : undefined
          }
        />
      ) : (
        <ol
          className="flex flex-col divide-y divide-border-subtle rounded-xl bg-surface shadow-sm"
          data-testid="leaderboard"
        >
          {entries.map((entry) => (
            <li key={entry.userId} className="flex items-center gap-3 px-4 py-3">
              <span
                className={cn(
                  'w-6 text-center font-mono text-sm font-semibold',
                  entry.rank <= 3 ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                {entry.rank}
              </span>
              <Avatar src={entry.avatar} name={entry.username} size="sm" />
              <Link
                href={`/u/${encodeURIComponent(entry.username)}`}
                className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
              >
                {entry.username}
              </Link>
              <span className="text-sm tabular-nums text-muted-foreground">
                {meta.format(entry.value)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/// Страница модуля «leaderboards» (ADR-0082): выключен или на техработах — понятное состояние.
export default function LeaderboardsPage() {
  return (
    <ModuleGate module="leaderboards">
      <LeaderboardsContent />
    </ModuleGate>
  );
}
