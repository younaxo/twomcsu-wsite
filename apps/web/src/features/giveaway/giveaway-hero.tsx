'use client';

import { ArrowDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatMsk, pluralDays, pluralHours, pluralMinutes, splitCountdown } from './format';
import { HowToParticipate, type PlayerProgress } from './how-to';
import { Reveal } from './reveal';
import { useNow } from './hooks';
import type { GiveawayPublicInfo } from './types';

export { WORKSPACE_ID } from './use-workspace-scroll';
import { WORKSPACE_ID } from './use-workspace-scroll';

const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

function Unit({ value, unit }: { value: number; unit: string }) {
  return (
    <div className="flex min-w-14 flex-col items-center sm:min-w-24">
      <span className="font-mono text-5xl font-black tabular-nums text-foreground sm:text-7xl">
        {String(value).padStart(2, '0')}
      </span>
      <span className="text-xs uppercase tracking-wide text-muted-foreground sm:text-sm">
        {unit}
      </span>
    </div>
  );
}

function Finished() {
  return (
    <p data-testid="hero-timer-finished" className="text-3xl font-bold text-foreground">
      Розыгрыш завершён
    </p>
  );
}

function Countdown({ targetIso, kind }: { targetIso: string; kind: 'start' | 'end' }) {
  const now = useNow(true);
  const ms = Date.parse(targetIso) - now;
  if (kind === 'end' && ms <= 0) return <Finished />;
  const left = splitCountdown(ms);
  const label = kind === 'start' ? 'До старта' : 'До конца розыгрыша';
  const spoken = `${left.days} ${pluralDays(left.days)} ${left.hours} ${pluralHours(left.hours)} ${left.minutes} ${pluralMinutes(left.minutes)}`;
  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-sm font-medium uppercase tracking-wide text-primary">{label}</p>
      <div
        role="timer"
        data-testid="hero-timer"
        aria-label={`${label} осталось ${spoken}`}
        className="flex items-start gap-2 sm:gap-4"
      >
        <Unit value={left.days} unit={pluralDays(left.days)} />
        <Unit value={left.hours} unit={pluralHours(left.hours)} />
        <Unit value={left.minutes} unit={pluralMinutes(left.minutes)} />
        <Unit value={left.seconds} unit="сек" />
      </div>
      <p className="text-sm text-muted-foreground">
        {kind === 'start' ? 'Старт' : 'Конец'}: {formatMsk(targetIso)}
      </p>
    </div>
  );
}

/// Верх страницы: название, крупный таймер (до старта или до конца, по МСК),
/// «как участвовать» и якорь к рабочей области. Порог и даты - только из /public.
/// `code` и `progress` - выданный код и прогресс игрока (если известны).
export function GiveawayHero({
  info,
  code = null,
  progress = null,
}: {
  info: GiveawayPublicInfo | null;
  code?: string | null;
  progress?: PlayerProgress | null;
}) {
  return (
    <header data-testid="giveaway-hero" className="flex flex-col items-center gap-10 text-center">
      <h1 className="text-balance text-4xl font-black tracking-tight sm:text-6xl">
        Розыгрыш на «Анархии Новой Эры»
      </h1>
      {info ? (
        info.status === 'before' ? (
          <Countdown targetIso={info.startAtUtc} kind="start" />
        ) : info.status === 'finished' ? (
          <Finished />
        ) : (
          <Countdown targetIso={info.cutoffAtUtc} kind="end" />
        )
      ) : null}
      <Reveal className="w-full max-w-3xl">
        <section aria-labelledby="gw-how" className="w-full">
          <h2 id="gw-how" className="mb-8 text-xl font-semibold text-foreground">
            Как участвовать
          </h2>
          <HowToParticipate
            thresholdHours={info ? info.thresholdHours : null}
            code={code}
            progress={progress}
          />
          {info ? (
            <p className="mt-6 text-sm text-muted-foreground" data-testid="hero-dates">
              Билеты выдаются с {formatMsk(info.startAtUtc)} до {formatMsk(info.cutoffAtUtc)}.
            </p>
          ) : null}
        </section>
      </Reveal>
      {info?.status === 'finished' ? null : (
        <a
          href={`#${WORKSPACE_ID}`}
          data-testid="hero-anchor"
          className={cn(
            'inline-flex h-control-lg items-center justify-center gap-2 rounded bg-primary px-6 text-base font-medium text-primary-foreground hover:bg-primary-hover active:bg-primary-active [&_svg]:size-5',
            focusRing,
          )}
        >
          Получить код
          <ArrowDown aria-hidden="true" />
        </a>
      )}
    </header>
  );
}
