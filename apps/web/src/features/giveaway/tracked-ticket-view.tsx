'use client';

import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatDuration } from './format';
import { fetchTrackedTicket, type TrackResult } from './track-api';
import { ReelChar } from './ticket-reel';

/// Страница отслеживания билета: номер, ник, отыгранное время и статус
/// розыгрыша. Без призов и шапки розыгрыша; доступ только по токену из ссылки.
export function TrackedTicketView({
  token,
  load = fetchTrackedTicket,
}: {
  token: string;
  load?: typeof fetchTrackedTicket;
}) {
  const [result, setResult] = useState<TrackResult | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    void load(token, undefined, undefined, controller.signal).then((r) => {
      if (!controller.signal.aborted) setResult(r);
    });
    return () => controller.abort();
  }, [token, load]);

  return (
    <main
      id="main"
      data-testid="track-page"
      className="mx-auto flex min-h-dvh w-full max-w-xl flex-col items-center justify-center gap-6 bg-background px-4 py-10 text-center text-foreground"
    >
      <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">TwoMC</p>
      {result === null ? (
        <p role="status" className="flex items-center gap-2 text-muted-foreground">
          <Loader2 aria-hidden="true" className="size-5 motion-safe:animate-spin" />
          Загружаем…
        </p>
      ) : result.kind === 'ok' ? (
        <section aria-labelledby="track-title" className="flex flex-col items-center gap-4">
          <h1 id="track-title" className="text-xl font-semibold">
            Билет в розыгрыше
          </h1>
          <div
            aria-label={`Билет ${result.data.ticket.split('').join(' ')}`}
            role="img"
            className="flex items-center gap-1 sm:gap-2"
          >
            {result.data.ticket.split('').map((char, index) => (
              <ReelChar key={index} char={char} index={index} play={false} />
            ))}
          </div>
          <dl className="flex flex-col gap-1 text-lg">
            <div>
              <dt className="inline text-muted-foreground">Игрок: </dt>
              <dd className="inline font-semibold">{result.data.playerName}</dd>
            </div>
            <div>
              <dt className="inline text-muted-foreground">Отыграно: </dt>
              <dd data-testid="track-played" className="inline font-semibold tabular-nums">
                {formatDuration(result.data.played.hours * 60 + result.data.played.minutes)}
              </dd>
            </div>
            <div>
              <dt className="inline text-muted-foreground">Розыгрыш: </dt>
              <dd data-testid="track-status" className="inline font-semibold">
                {result.data.status === 'finished' ? 'завершён' : 'идёт'}
              </dd>
            </div>
          </dl>
        </section>
      ) : result.kind === 'not_found' ? (
        <section role="alert" className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold">Билет не найден</h1>
          <p className="text-muted-foreground">
            Проверьте ссылку: она могла быть скопирована не полностью.
          </p>
        </section>
      ) : (
        <section role="alert" className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold">Не удалось загрузить</h1>
          <p className="text-muted-foreground">Попробуйте обновить страницу чуть позже.</p>
        </section>
      )}
      <Link
        href="/giveaway"
        className="text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        К странице розыгрыша
      </Link>
    </main>
  );
}
