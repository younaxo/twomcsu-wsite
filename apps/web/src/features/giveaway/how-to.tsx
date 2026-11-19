'use client';

import { Check, Clock, Copy, KeyRound, Terminal, type LucideIcon } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { formatDuration, pluralHours } from './format';

export const COMMAND_PLACEHOLDER = 'XXXX-XXXX-XXXX-XXXX';
const GAME_COMMAND = '/giveaway';

/// Прогресс игрока: известен после попытки ввода кода в игре или по выданному билету.
export interface PlayerProgress {
  minutes: number;
  thresholdMinutes: number;
  remainingMinutes: number;
}

const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

function CommandRow({ code }: { code: string | null }) {
  const command = `${GAME_COMMAND} ${code ?? COMMAND_PLACEHOLDER}`;
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(id);
  }, [copied]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      toast.success('Команда скопирована');
    } catch {
      toast.error('Не удалось скопировать', { description: 'Выделите команду вручную.' });
    }
  };
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 rounded bg-surface-sunken px-4 py-3">
      <code
        data-testid="how-command"
        className="min-w-0 flex-1 select-all break-all font-mono text-base font-semibold text-foreground sm:text-lg"
      >
        {command}
      </code>
      <button
        type="button"
        onClick={() => void copy()}
        className={cn(
          'inline-flex h-control items-center justify-center gap-2 rounded border border-border-strong bg-surface px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted [&_svg]:size-4',
          focusRing,
        )}
      >
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        {copied ? 'Скопировано' : 'Копировать'}
      </button>
    </div>
  );
}

function ProgressLine({ progress }: { progress: PlayerProgress }) {
  const percent = Math.min(
    100,
    Math.floor((progress.minutes * 100) / Math.max(1, progress.thresholdMinutes)),
  );
  return (
    <div data-testid="how-progress" className="mt-3 flex flex-col gap-2 text-sm">
      <p className="text-foreground">
        Ваш прогресс:{' '}
        <span className="font-semibold tabular-nums">{formatDuration(progress.minutes)}</span> из{' '}
        <span className="tabular-nums">{formatDuration(progress.thresholdMinutes)}</span>
        {progress.remainingMinutes > 0 ? (
          <>
            , осталось{' '}
            <span className="font-semibold tabular-nums">
              {formatDuration(progress.remainingMinutes)}
            </span>
          </>
        ) : (
          '. Порог набран.'
        )}
      </p>
      <div
        role="progressbar"
        aria-label="Прогресс до порога"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-surface-sunken"
      >
        <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function Step({
  n,
  last,
  icon: Icon,
  title,
  children,
}: {
  n: number;
  last: boolean;
  icon: LucideIcon;
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <li className="flex gap-5">
      <div className="flex w-10 shrink-0 flex-col items-center sm:w-14">
        <span
          aria-hidden="true"
          className="text-5xl font-black leading-none tabular-nums text-primary sm:text-6xl"
        >
          {n}
        </span>
        {last ? null : <span aria-hidden="true" className="mt-3 w-px flex-1 bg-border-strong" />}
      </div>
      <div className={cn('min-w-0 flex-1 pt-1', last ? '' : 'pb-10')}>
        <p className="flex items-start gap-2 text-lg font-medium text-foreground">
          <Icon aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary" />
          <span>{title}</span>
        </p>
        {children}
      </div>
    </li>
  );
}

/// «Как участвовать»: вертикальный путь из трёх шагов без карточек. Порог - из /public.
export function HowToParticipate({
  thresholdHours,
  code = null,
  progress = null,
}: {
  thresholdHours: number | null;
  /// Выданный код (вид XXXX-XXXX-XXXX-XXXX); иначе в команде подставлен образец.
  code?: string | null;
  progress?: PlayerProgress | null;
}) {
  const hours =
    thresholdHours !== null
      ? `${thresholdHours} ${pluralHours(thresholdHours)}`
      : 'нужное количество часов';
  return (
    <ol data-testid="how-steps" className="flex w-full flex-col text-left">
      <Step
        n={1}
        last={false}
        icon={Clock}
        title={<>Наберите {hours} онлайна на «Анархии Новой Эры».</>}
      >
        {progress ? <ProgressLine progress={progress} /> : null}
      </Step>
      <Step n={2} last={false} icon={KeyRound} title="Получите код на этом сайте." />
      <Step n={3} last icon={Terminal} title="Введите команду в игре и получите билет.">
        <CommandRow code={code} />
      </Step>
    </ol>
  );
}
