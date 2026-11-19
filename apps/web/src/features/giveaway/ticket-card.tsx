'use client';

import { Ticket } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { usePrefersReducedMotion } from './hooks';

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '0123456789';
const FRAME_MS = 60;
/// Момент остановки каждой из четырёх ячеек (буква, затем три цифры).
const SETTLE_AT_MS = [700, 1050, 1400, 1750] as const;

function randomChar(index: number): string {
  const pool = index === 0 ? LETTERS : DIGITS;
  return pool[Math.floor(Math.random() * pool.length)]!;
}

export interface TicketCardProps {
  ticket: string;
  playerName: string;
  /// Играть анимацию перебора символов (при prefers-reduced-motion не играется).
  animate: boolean;
  /// Билет был получен раньше.
  previously?: boolean;
}

/// Итоговый билет: буква + три цифры и ник. Значение определено сервером до
/// анимации; анимация только визуальная (скрыта от screen reader).
export function TicketCard({ ticket, playerName, animate, previously = false }: TicketCardProps) {
  const reduced = usePrefersReducedMotion();
  const play = animate && !reduced;
  const chars = ticket.split('');
  const [elapsed, setElapsed] = useState(play ? 0 : Number.POSITIVE_INFINITY);
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!play) {
      setElapsed(Number.POSITIVE_INFINITY);
      return;
    }
    setElapsed(0);
    const started = Date.now();
    const id = setInterval(() => {
      const spent = Date.now() - started;
      setFrame((n) => n + 1);
      setElapsed(spent);
      if (spent >= SETTLE_AT_MS[SETTLE_AT_MS.length - 1]!) clearInterval(id);
    }, FRAME_MS);
    return () => clearInterval(id);
  }, [play, ticket]);

  const settled = elapsed >= SETTLE_AT_MS[SETTLE_AT_MS.length - 1]!;

  return (
    <div
      data-testid="ticket-card"
      data-settled={settled}
      className="flex flex-col items-center gap-4"
    >
      <div
        aria-hidden="true"
        className="flex items-center gap-2 sm:gap-3"
        data-frame={play ? frame : undefined}
      >
        {chars.map((char, index) => {
          const done = elapsed >= (SETTLE_AT_MS[index] ?? 0);
          return (
            <span
              key={index}
              data-testid="ticket-char"
              data-done={done}
              className={cn(
                'flex h-16 w-12 items-center justify-center rounded-lg border-2 font-mono text-4xl font-bold tabular-nums sm:h-24 sm:w-[4.5rem] sm:text-6xl',
                done
                  ? 'border-primary bg-primary-soft text-primary-soft-foreground'
                  : 'border-border-strong bg-surface-sunken text-muted-foreground',
              )}
            >
              {done ? char : randomChar(index)}
            </span>
          );
        })}
      </div>
      <p className="text-center text-lg text-foreground">
        <span className="text-muted-foreground">Игрок: </span>
        <span className="font-semibold">{playerName}</span>
      </p>
      {previously ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Ticket aria-hidden="true" className="size-4" />
          Билет уже получен. Новый получить нельзя: один билет на игрока.
        </p>
      ) : null}
      {/* Объявляется один раз, когда билет «остановился». */}
      <p role="status" aria-live="polite" className="sr-only">
        {settled ? `Ваш билет ${ticket.split('').join(' ')}, игрок ${playerName}` : ''}
      </p>
    </div>
  );
}
