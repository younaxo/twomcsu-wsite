'use client';

import { Gift, ShieldCheck, Trophy } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { usePrefersReducedMotion } from './hooks';
import { prizeImageSrc } from './prize-images';
import type { ResultsReady, ResultsWinner } from './results-types';
import { TestBadge } from './test-badge';

/// Пауза перед первым победителем и между победителями (мс).
export const REVEAL_FIRST_MS = 1200;
export const REVEAL_STEP_MS = 2400;

/// Порядок показа: `revealOrder` с сервера, иначе от последнего места к первому.
export function resolveRevealOrder(data: Pick<ResultsReady, 'winners' | 'revealOrder'>): number[] {
  const places = new Set(data.winners.map((w) => w.place));
  const given = (data.revealOrder ?? []).filter((p) => places.has(p));
  if (given.length === places.size && given.length > 0) return given;
  return [...places].sort((a, b) => b - a);
}

function PrizeImage({ winner }: { winner: ResultsWinner }) {
  const src = winner.imageFile ? prizeImageSrc(winner.imageFile) : null;
  return (
    <div className="flex size-20 shrink-0 items-center justify-center rounded bg-muted sm:size-24">
      {src ? (
        <Image
          src={src}
          alt={winner.prizeName}
          width={96}
          height={72}
          unoptimized
          className="h-auto w-full"
        />
      ) : (
        <Gift aria-label={winner.prizeName} role="img" className="size-8 text-muted-foreground" />
      )}
    </div>
  );
}

function WinnerRow({ winner, fresh }: { winner: ResultsWinner; fresh: boolean }) {
  return (
    <li
      data-testid="winner-row"
      data-place={winner.place}
      className={cn(
        'flex items-center gap-4 rounded-lg border border-border bg-surface p-3 sm:p-4',
        winner.place === 1 && 'border-primary bg-primary-soft',
        fresh && 'motion-safe:animate-pop-in',
      )}
    >
      <span
        className={cn(
          'flex size-12 shrink-0 items-center justify-center rounded-full bg-muted text-xl font-bold tabular-nums text-foreground',
          winner.place === 1 && 'bg-primary text-primary-foreground',
        )}
      >
        <span className="sr-only">Место </span>
        {winner.place}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-lg font-semibold text-foreground">{winner.playerName}</p>
        <p className="text-sm text-muted-foreground">
          Билет <span className="font-mono font-semibold text-foreground">{winner.ticket}</span>
        </p>
        <p className="text-sm text-foreground">{winner.prizeName}</p>
      </div>
      <PrizeImage winner={winner} />
    </li>
  );
}

const ALGORITHM_TEXT =
  'Билеты сортируются по возрастанию, из них строится канонический JSON, его SHA-256 — хэш снимка (он опубликован заранее). ' +
  'Случайная перестановка строится по зерну через HMAC-SHA256 (Фишер — Йетс); места 1–10 получают билеты по порядку. ' +
  'Дисквалифицированному заменяет следующий неиспользованный билет порядка.';

function Fairness({ data }: { data: ResultsReady }) {
  return (
    <section
      aria-labelledby="gw-fair"
      className="rounded-lg border border-border bg-surface p-4 sm:p-6"
    >
      <h2 id="gw-fair" className="flex items-center gap-2 text-xl font-semibold text-foreground">
        <ShieldCheck aria-hidden="true" className="size-5 text-primary" />
        Проверка честности
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">{ALGORITHM_TEXT}</p>
      <dl className="mt-4 grid gap-3 text-sm">
        <div>
          <dt className="text-muted-foreground">Алгоритм</dt>
          <dd className="font-mono text-foreground">{data.algorithm}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Хэш снимка билетов ({data.ticketCount})</dt>
          <dd className="break-all font-mono text-foreground">{data.snapshotHash}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Зерно</dt>
          <dd className="break-all font-mono text-foreground">{data.seed}</dd>
        </div>
      </dl>
      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-medium text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          Порядок билетов после перестановки ({data.order.length})
        </summary>
        <ol data-testid="fair-order" className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
          {data.order.map((entry, index) => (
            <li key={`${entry.ticket}-${index}`} className="font-mono text-foreground">
              {index + 1}. {entry.ticket}{' '}
              <span className="font-sans text-muted-foreground">{entry.playerName}</span>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}

/// Итоги розыгрыша: победители по очереди (10 -> 1), затем проверка честности.
/// При prefers-reduced-motion и после завершения показа список выводится сразу.
export function GiveawayResults({ data }: { data: ResultsReady }) {
  const reduced = usePrefersReducedMotion();
  const order = resolveRevealOrder(data);
  const total = order.length;
  const [shown, setShown] = useState(0);
  const completed = useRef(false);
  const all = reduced || completed.current || shown >= total;

  useEffect(() => {
    if (all) {
      completed.current = true;
      return;
    }
    const timer = setTimeout(
      () => setShown((n) => n + 1),
      shown === 0 ? REVEAL_FIRST_MS : REVEAL_STEP_MS,
    );
    return () => clearTimeout(timer);
  }, [all, shown]);

  const byPlace = new Map(data.winners.map((w) => [w.place, w]));
  const visible = (all ? order : order.slice(0, shown))
    .map((place) => byPlace.get(place))
    .filter((w): w is ResultsWinner => w !== undefined);
  const latest = visible[visible.length - 1];
  const newest = all ? null : (latest?.place ?? null);

  return (
    <main
      id="main"
      className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-8 sm:py-12"
    >
      {data.test ? <TestBadge /> : null}
      <header className="flex flex-col items-center gap-2 text-center">
        <Trophy aria-hidden="true" className="size-10 text-primary" />
        <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
          Итоги розыгрыша
        </h1>
        <p className="text-muted-foreground">
          {all ? 'Победители объявлены.' : 'Объявляем победителей — от 10 места к первому.'}
        </p>
      </header>
      {visible.length > 0 ? (
        <ol data-testid="winners" className="flex flex-col gap-3" aria-label="Победители">
          {visible.map((winner) => (
            <WinnerRow key={winner.place} winner={winner} fresh={winner.place === newest} />
          ))}
        </ol>
      ) : (
        <p role="status" className="text-center text-muted-foreground">
          Эфир начинается…
        </p>
      )}
      <div role="status" aria-live="polite" className="sr-only">
        {latest && !all
          ? `${latest.place} место: ${latest.playerName}, билет ${latest.ticket}`
          : ''}
      </div>
      {all && data.disqualified.length > 0 ? (
        <section aria-labelledby="gw-dq" className="rounded-lg border border-border bg-surface p-4">
          <h2 id="gw-dq" className="text-lg font-semibold text-foreground">
            Дисквалифицированы
          </h2>
          <ul data-testid="disqualified" className="mt-2 grid gap-1 text-sm text-muted-foreground">
            {data.disqualified.map((d) => (
              <li key={`${d.place}-${d.ticket}`}>
                {d.place} место: {d.playerName}, билет {d.ticket} ({d.prizeName})
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {all ? <Fairness data={data} /> : null}
    </main>
  );
}
