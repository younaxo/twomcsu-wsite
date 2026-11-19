'use client';

import {
  AlertTriangle,
  CalendarClock,
  Check,
  Clock,
  Copy,
  Flag,
  KeyRound,
  Loader2,
  RefreshCw,
  Terminal,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import {
  formatCode,
  formatMsk,
  formatMmSs,
  pluralDays,
  pluralHours,
  pluralMinutes,
  splitCountdown,
} from './format';
import { useNow } from './hooks';
import { TicketCard } from './ticket-card';
import type { GiveawayApi, GiveawayErrorKind, GiveawayPublicInfo } from './types';
import { useGiveaway, type CodeView } from './use-giveaway';

const SITE_HREF = 'https://twomc.su';
const GAME_COMMAND = '/giveaway';

const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

function ActionButton({
  children,
  onClick,
  loading = false,
  variant = 'primary',
  type = 'button',
}: {
  children: ReactNode;
  onClick: () => void;
  loading?: boolean;
  variant?: 'primary' | 'secondary';
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex h-control-lg min-w-48 items-center justify-center gap-2 rounded px-5 text-base font-medium transition-colors disabled:cursor-wait disabled:opacity-60 [&_svg]:size-5',
        focusRing,
        variant === 'primary'
          ? 'bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-active'
          : 'border border-border-strong bg-surface text-foreground hover:bg-muted',
      )}
    >
      {loading ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
      {children}
    </button>
  );
}

function errorText(kind: GiveawayErrorKind, retryAfterSeconds: number | null): string {
  switch (kind) {
    case 'rate_limited': {
      const wait =
        retryAfterSeconds !== null && retryAfterSeconds > 0
          ? ` Повторите через ${
              retryAfterSeconds >= 60
                ? `${Math.ceil(retryAfterSeconds / 60)} ${pluralMinutes(Math.ceil(retryAfterSeconds / 60))}`
                : `${retryAfterSeconds} с`
            }.`
          : ' Подождите немного и повторите.';
      return `Слишком много попыток.${wait}`;
    }
    case 'unavailable':
      return 'Сервис розыгрыша временно недоступен. Попробуйте чуть позже.';
    case 'network':
      return 'Нет связи с сервером. Проверьте подключение к интернету и повторите.';
    default:
      return 'Не удалось выполнить запрос. Попробуйте ещё раз.';
  }
}

/// Блок состояния: заголовок получает фокус при смене состояния.
function StateHeading({ id, children }: { id: string; children: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    ref.current?.focus();
  }, [id]);
  return (
    <h2
      ref={ref}
      tabIndex={-1}
      className="text-balance text-center text-2xl font-semibold text-foreground outline-none"
    >
      {children}
    </h2>
  );
}

function CountdownUnit({ value, unit }: { value: number; unit: string }) {
  return (
    <div className="flex min-w-16 flex-col items-center rounded-lg border border-border bg-surface-sunken px-3 py-2 sm:min-w-24 sm:py-3">
      <span className="font-mono text-3xl font-bold tabular-nums text-foreground sm:text-5xl">
        {String(value).padStart(2, '0')}
      </span>
      <span className="text-xs text-muted-foreground sm:text-sm">{unit}</span>
    </div>
  );
}

function BeforeStart({ info }: { info: GiveawayPublicInfo }) {
  const now = useNow(true);
  const left = splitCountdown(Date.parse(info.startAtUtc) - now);
  const spoken = `${left.days} ${pluralDays(left.days)} ${left.hours} ${pluralHours(left.hours)} ${left.minutes} ${pluralMinutes(left.minutes)}`;
  return (
    <section aria-labelledby="gw-state" className="flex flex-col items-center gap-6">
      <CalendarClock aria-hidden="true" className="size-10 text-primary" />
      <StateHeading id="before">
        <span id="gw-state">Розыгрыш скоро начнётся</span>
      </StateHeading>
      <p className="text-center text-muted-foreground">
        Старт: <strong className="text-foreground">{formatMsk(info.startAtUtc)}</strong>
      </p>
      <div role="timer" aria-label={`До старта осталось ${spoken}`} className="flex gap-2 sm:gap-3">
        <CountdownUnit value={left.days} unit={pluralDays(left.days)} />
        <CountdownUnit value={left.hours} unit={pluralHours(left.hours)} />
        <CountdownUnit value={left.minutes} unit={pluralMinutes(left.minutes)} />
        <CountdownUnit value={left.seconds} unit="сек" />
      </div>
      <p className="text-center text-sm text-muted-foreground">
        Билеты можно получить с момента старта и до {formatMsk(info.cutoffAtUtc)}.
      </p>
    </section>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(id);
  }, [copied]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setFailed(false);
      setCopied(true);
    } catch {
      setFailed(true);
    }
  };
  return (
    <>
      <button
        type="button"
        onClick={() => void copy()}
        className={cn(
          'inline-flex h-control items-center justify-center gap-2 rounded border border-border-strong bg-surface px-4 text-sm font-medium text-foreground hover:bg-muted [&_svg]:size-4',
          focusRing,
        )}
      >
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        {copied ? 'Скопировано' : 'Скопировать'}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? 'Код скопирован' : failed ? 'Не удалось скопировать, выделите код вручную' : ''}
      </span>
      {failed ? (
        <span className="text-sm text-destructive">
          Не удалось скопировать: выделите код вручную.
        </span>
      ) : null}
    </>
  );
}

function PendingCode({
  view,
  pollIssue,
  onNew,
  thresholdHours,
}: {
  view: Extract<CodeView, { kind: 'pending' }>;
  pollIssue: GiveawayErrorKind | null;
  onNew: () => void;
  thresholdHours: number;
}) {
  const now = useNow(true);
  const left = view.expiresAtMs - now;
  const shown = view.code ? formatCode(view.code) : null;
  return (
    <section aria-labelledby="gw-state" className="flex flex-col items-center gap-5">
      <KeyRound aria-hidden="true" className="size-10 text-primary" />
      <StateHeading id="pending">
        <span id="gw-state">{shown ? 'Ваш код' : 'Код уже выдан'}</span>
      </StateHeading>
      {shown ? (
        <>
          <p
            data-testid="giveaway-code"
            className="select-all break-all rounded-lg border-2 border-primary bg-surface-sunken px-4 py-3 text-center font-mono text-2xl font-bold tracking-wider text-foreground sm:text-4xl"
          >
            {shown}
          </p>
          <CopyButton text={shown} />
        </>
      ) : (
        <p className="max-w-prose text-center text-muted-foreground">
          Код показывается один раз, при перезагрузке страницы он скрыт. Если вы его не сохранили,
          получите новый.
        </p>
      )}
      <div className="flex w-full max-w-md items-start gap-3 rounded-lg border border-border bg-surface-sunken p-4 text-sm">
        <Terminal aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
        <p className="text-foreground">
          Зайдите на «Анархию Новой Эры» и введите в игре:{' '}
          <code className="whitespace-nowrap rounded bg-surface px-1.5 py-0.5 font-mono font-semibold">
            {GAME_COMMAND} {shown ?? 'КОД'}
          </code>
        </p>
      </div>
      <p className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="code-timer">
        <Clock aria-hidden="true" className="size-4" />
        Код действует ещё{' '}
        <span className="font-mono font-semibold tabular-nums text-foreground">
          {formatMmSs(left)}
        </span>
      </p>
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 aria-hidden="true" className="size-4 motion-safe:animate-spin" />
        Ждём, пока вы введёте код в игре. Страница обновится сама.
      </p>
      {pollIssue ? (
        <p className="text-center text-sm text-warning" data-testid="poll-issue">
          {pollIssue === 'rate_limited'
            ? 'Проверка идёт реже обычного: слишком много запросов.'
            : 'Нет связи, пробуем снова…'}
        </p>
      ) : null}
      <p className="max-w-prose text-center text-xs text-muted-foreground">
        Если на сервере наиграно меньше {thresholdHours} {pluralHours(thresholdHours)}, игра
        покажет, сколько осталось.
      </p>
      <ActionButton variant="secondary" onClick={onNew}>
        <RefreshCw aria-hidden="true" />
        Новый код
      </ActionButton>
    </section>
  );
}

function Running({
  info,
  view,
  pollIssue,
  issue,
}: {
  info: GiveawayPublicInfo;
  view: CodeView;
  pollIssue: GiveawayErrorKind | null;
  issue: () => void;
}) {
  if (view.kind === 'pending') {
    return (
      <PendingCode
        view={view}
        pollIssue={pollIssue}
        onNew={issue}
        thresholdHours={info.thresholdHours}
      />
    );
  }
  if (view.kind === 'ticket') {
    return (
      <section aria-labelledby="gw-state" className="flex flex-col items-center gap-6">
        <StateHeading id="ticket">
          <span id="gw-state">{view.previously ? 'Ваш билет' : 'Вы в розыгрыше!'}</span>
        </StateHeading>
        <TicketCard
          ticket={view.ticket}
          playerName={view.playerName}
          animate={view.animate}
          previously={view.previously}
        />
      </section>
    );
  }
  const busy = view.kind === 'issuing';
  return (
    <section aria-labelledby="gw-state" className="flex flex-col items-center gap-5">
      <KeyRound aria-hidden="true" className="size-10 text-primary" />
      <StateHeading id={view.kind}>
        <span id="gw-state">{view.kind === 'expired' ? 'Код истёк' : 'Розыгрыш идёт'}</span>
      </StateHeading>
      {view.kind === 'expired' ? (
        <p className="text-center text-muted-foreground">
          Код действует 10 минут и больше не работает. Получите новый и введите его в игре.
        </p>
      ) : (
        <p className="max-w-prose text-center text-muted-foreground">
          Наиграйте {info.thresholdHours} {pluralHours(info.thresholdHours)} на «Анархии Новой Эры»,
          получите код здесь и введите его в игре командой{' '}
          <code className="font-mono font-semibold text-foreground">{GAME_COMMAND} КОД</code>.
          Участие бесплатное.
        </p>
      )}
      {view.kind === 'error' ? (
        <p
          role="alert"
          className="flex w-full max-w-md items-start gap-3 rounded-lg border border-destructive/50 bg-destructive-soft p-4 text-sm text-foreground"
        >
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-destructive" />
          {errorText(view.error, view.retryAfterSeconds)}
        </p>
      ) : null}
      <ActionButton onClick={issue} loading={busy}>
        {view.kind === 'expired' || view.kind === 'error' ? 'Получить код снова' : 'Получить код'}
      </ActionButton>
      <p className="max-w-prose text-center text-xs text-muted-foreground">
        Если время не набрано, игра покажет, сколько осталось. Один билет на игрока.
      </p>
    </section>
  );
}

function Finished({ view }: { view: CodeView }) {
  return (
    <section aria-labelledby="gw-state" className="flex flex-col items-center gap-6">
      <Flag aria-hidden="true" className="size-10 text-primary" />
      <StateHeading id="finished">
        <span id="gw-state">Розыгрыш завершён</span>
      </StateHeading>
      <p className="text-center text-muted-foreground">
        Приём билетов закрыт. Спасибо всем, кто участвовал!
      </p>
      {view.kind === 'ticket' ? (
        <TicketCard ticket={view.ticket} playerName={view.playerName} animate={false} previously />
      ) : null}
    </section>
  );
}

function announcement(view: CodeView): string {
  switch (view.kind) {
    case 'issuing':
      return 'Получаем код…';
    case 'pending':
      return view.code
        ? 'Код выдан. Введите его в игре, страница обновится сама.'
        : 'Код уже выдан. Для нового нажмите «Новый код».';
    case 'expired':
      return 'Код истёк. Получите новый.';
    default:
      return '';
  }
}

export interface GiveawayPageProps {
  api: GiveawayApi;
  autoIssue?: boolean;
}

/// Страница розыгрыша: все состояния. Данные - только через переданный `api`.
export function GiveawayPage({ api, autoIssue = false }: GiveawayPageProps) {
  const { info, view, pollIssue, issue, reload } = useGiveaway(api, { autoIssue });
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between gap-3 px-4">
          <a
            href={SITE_HREF}
            aria-label="twomc.su — на главный сайт"
            className={cn('rounded-sm text-xl font-bold tracking-tight', focusRing)}
          >
            tw<span className="text-primary">o</span>mc.su
          </a>
          <span className="text-sm text-muted-foreground">Розыгрыш</span>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:py-12">
        <div className="text-center">
          <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            Розыгрыш на «Анархии Новой Эры»
          </h1>
        </div>
        <div
          className="rounded-xl border border-border bg-surface p-5 shadow sm:p-8"
          data-testid="giveaway-card"
        >
          {info.kind === 'loading' ? (
            <p
              role="status"
              className="flex items-center justify-center gap-2 py-10 text-muted-foreground"
            >
              <Loader2 aria-hidden="true" className="size-5 animate-spin" />
              Загружаем…
            </p>
          ) : info.kind === 'error' ? (
            <section className="flex flex-col items-center gap-5 py-4" aria-labelledby="gw-state">
              <AlertTriangle aria-hidden="true" className="size-10 text-destructive" />
              <StateHeading id="load-error">
                <span id="gw-state">Не удалось загрузить розыгрыш</span>
              </StateHeading>
              <p role="alert" className="text-center text-muted-foreground">
                {errorText(info.error, null)}
              </p>
              <ActionButton onClick={reload}>
                <RefreshCw aria-hidden="true" />
                Повторить
              </ActionButton>
            </section>
          ) : info.info.status === 'before' ? (
            <BeforeStart info={info.info} />
          ) : info.info.status === 'finished' ? (
            <Finished view={view} />
          ) : (
            <Running info={info.info} view={view} pollIssue={pollIssue} issue={issue} />
          )}
        </div>
        {info.kind === 'ready' ? (
          <p className="text-center text-sm text-muted-foreground" data-testid="giveaway-dates">
            {formatMsk(info.info.startAtUtc)} — {formatMsk(info.info.cutoffAtUtc)}
            {info.info.status === 'running' ? (
              <>
                {' '}
                · Билетов выдано: <span className="tabular-nums">{info.info.ticketsIssued}</span>
              </>
            ) : null}
          </p>
        ) : null}
        <div role="status" aria-live="polite" className="sr-only">
          {announcement(view)}
        </div>
      </main>
    </div>
  );
}
