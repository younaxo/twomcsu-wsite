'use client';

import { FlaskConical } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import type { MockScenario } from './mock-api';

/// Подписи сценариев мока. Только для разработки: модуль подгружается из
/// `giveaway-app.tsx` за константным условием и в production-сборку не попадает.
export const DEV_SCENARIO_LABELS: Record<MockScenario, string> = {
  before: 'До старта',
  running: 'Идёт (кода нет)',
  pending: 'Ожидание кода',
  not_enough: 'Время не набрано',
  ticket: 'Билет (с анимацией)',
  redeemed: 'Билет уже получен',
  expired: 'Код истёк',
  limit: 'Много попыток',
  offline: 'Ошибка сети',
  down: 'Сервис недоступен',
  finished: 'Завершён',
};

const ORDER: readonly MockScenario[] = [
  'before',
  'running',
  'pending',
  'not_enough',
  'ticket',
  'redeemed',
  'expired',
  'limit',
  'offline',
  'down',
  'finished',
];

const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

export interface DevSwitcherProps {
  current: MockScenario | null;
  onSelect: (scenario: MockScenario) => void;
}

/// Фиксированная панель переключения сценариев мока (solid-фон, без blur).
export default function DevSwitcher({ current, onSelect }: DevSwitcherProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const onPointer = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  return (
    <div ref={root} className="fixed bottom-3 right-3 z-50 flex flex-col items-end gap-2">
      {open ? (
        <ul
          id="gw-dev-menu"
          aria-label="Сценарии мока"
          className="max-h-[70dvh] w-64 max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-lg border border-border-strong bg-surface p-1 shadow-lg"
        >
          {ORDER.map((scenario) => (
            <li key={scenario}>
              <button
                type="button"
                aria-pressed={current === scenario}
                onClick={() => {
                  onSelect(scenario);
                  setOpen(false);
                  trigger.current?.focus();
                }}
                className={cn(
                  'flex h-control w-full items-center rounded px-3 text-left text-sm text-foreground hover:bg-muted',
                  focusRing,
                  current === scenario &&
                    'bg-primary-soft font-semibold text-primary-soft-foreground',
                )}
              >
                {DEV_SCENARIO_LABELS[scenario]}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls={open ? 'gw-dev-menu' : undefined}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'inline-flex h-control items-center gap-2 rounded border border-border-strong bg-surface px-3 text-sm font-medium text-foreground shadow hover:bg-muted [&_svg]:size-4',
          focusRing,
        )}
      >
        <FlaskConical aria-hidden="true" />
        Состояния (dev)
      </button>
    </div>
  );
}
