'use client';

import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AdminApiError, type AdminMode } from './admin-types';

const MESSAGES: Record<string, string> = {
  threshold_cannot_increase_after_start: 'После старта порог можно только уменьшить.',
  start_cannot_change_after_start: 'После старта дату начала менять нельзя.',
  cutoff_in_past: 'Дату отсечки нельзя перенести в прошлое после старта.',
  window_invalid: 'Даты заданы неверно: старт должен быть раньше отсечки.',
  draw_frozen: 'Розыгрыш заморожен: настройки больше не меняются.',
  cutoff_not_reached: 'Отсечка ещё не наступила: заморозить розыгрыш пока нельзя.',
  no_tickets: 'Нет ни одного билета.',
  not_frozen: 'Сначала нужно заморозить розыгрыш.',
  snapshot_mismatch: 'Хэш снимка не совпал: обновите страницу и проверьте его ещё раз.',
  already_calculated: 'Розыгрыш уже рассчитан: повторный расчёт невозможен.',
  no_prizes: 'Список призов пуст.',
  not_calculated: 'Сначала нужно рассчитать результат.',
  already_broadcast: 'Эфир уже запущен.',
  winner_not_active: 'Этот победитель уже дисквалифицирован.',
  not_found: 'Запись не найдена.',
  csrf: 'Запрос отклонён защитой (CSRF). Перезагрузите страницу и повторите.',
  not_enough_time: 'У игрока меньше минут, чем нужно для билета.',
  test_mode_disabled: 'Тестовый режим выключен.',
  invalid_body: 'Проверьте введённые значения.',
  rate_limited: 'Слишком много запросов. Подождите немного.',
  network: 'Нет связи с сервером.',
};

/// Понятный текст ошибки админ-API (коды бэкенда, ADR-G003 п. 5).
export function adminErrorText(error: unknown): string {
  if (error instanceof AdminApiError) {
    return MESSAGES[error.code] ?? `Не удалось выполнить действие (${error.code}).`;
  }
  return 'Не удалось выполнить действие.';
}

export type LoadState<T> =
  | { kind: 'loading' }
  | { kind: 'error'; error: unknown }
  | { kind: 'ready'; data: T };

/// Загрузка данных раздела с возможностью обновить. `fn` вызывается при смене `deps`.
export function useLoad<T>(
  fn: () => Promise<T>,
  deps: readonly unknown[],
): { state: LoadState<T>; reload: () => void } {
  const [state, setState] = useState<LoadState<T>>({ kind: 'loading' });
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    let stopped = false;
    setState((prev) => (prev.kind === 'ready' ? prev : { kind: 'loading' }));
    fnRef
      .current()
      .then((data) => {
        if (!stopped) setState({ kind: 'ready', data });
      })
      .catch((error: unknown) => {
        if (!stopped) setState({ kind: 'error', error });
      });
    return () => {
      stopped = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { state, reload };
}

export function LoadView<T>({
  state,
  reload,
  children,
}: {
  state: LoadState<T>;
  reload: () => void;
  children: (data: T) => ReactNode;
}) {
  if (state.kind === 'loading') {
    return (
      <p role="status" className="flex items-center gap-2 py-6 text-muted-foreground">
        <Loader2 aria-hidden="true" className="size-5 animate-spin motion-reduce:animate-none" />
        Загружаем…
      </p>
    );
  }
  if (state.kind === 'error') {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 py-4">
        <p className="flex items-center gap-2 text-destructive">
          <AlertTriangle aria-hidden="true" className="size-5" />
          {adminErrorText(state.error)}
        </p>
        <Button variant="secondary" onClick={reload}>
          <RefreshCw />
          Повторить
        </Button>
      </div>
    );
  }
  return <>{children(state.data)}</>;
}

/// Крупная метка режима на заголовке раздела: «ТЕСТ» заметна всегда.
export function ModeTag({ mode }: { mode: AdminMode }) {
  return mode === 'test' ? (
    <span
      data-testid="mode-tag-test"
      className="rounded border-2 border-warning bg-warning-soft px-2 py-0.5 text-sm font-bold uppercase tracking-wider text-foreground"
    >
      ТЕСТ
    </span>
  ) : null;
}

export function Panel({
  title,
  mode,
  actions,
  children,
}: {
  title: string;
  mode?: AdminMode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold text-foreground">{title}</h2>
        {mode ? <ModeTag mode={mode} /> : null}
        {actions ? <div className="ml-auto flex gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export const tableClass = 'w-full text-left text-sm';
export const thClass = 'border-b border-border px-2 py-2 font-medium text-muted-foreground';
export const tdClass = 'border-b border-border px-2 py-2 text-foreground';

/// ISO UTC -> ISO для поля datetime-local в UTC (без секунд) и обратно.
export function toLocalInput(iso: string): string {
  return iso.slice(0, 16);
}
export function fromLocalInput(value: string): string {
  return `${value}:00.000Z`;
}
