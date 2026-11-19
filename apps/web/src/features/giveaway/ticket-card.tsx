'use client';

import { Ticket } from 'lucide-react';
import { useEffect, useState } from 'react';
import { usePrefersReducedMotion } from './hooks';
import { TicketActions } from './ticket-actions';
import { ReelChar, REEL_TOTAL_MS } from './ticket-reel';

export interface TicketCardProps {
  ticket: string;
  playerName: string;
  /// Играть анимацию «барабана» (при prefers-reduced-motion не играется).
  animate: boolean;
  /// Билет был получен раньше.
  previously?: boolean;
  /// Дата выдачи (UTC ISO) и токен ссылки отслеживания: для кнопок под билетом.
  issuedAt?: string | null;
  trackingToken?: string | null;
}

/// Итоговый билет: буква + три цифры и ник. Значение определено сервером до
/// анимации; анимация только визуальная (скрыта от screen reader).
export function TicketCard({
  ticket,
  playerName,
  animate,
  previously = false,
  issuedAt = null,
  trackingToken = null,
}: TicketCardProps) {
  const reduced = usePrefersReducedMotion();
  const play = animate && !reduced;
  const [settled, setSettled] = useState(!play);

  useEffect(() => {
    if (!play) {
      setSettled(true);
      return;
    }
    setSettled(false);
    const id = setTimeout(() => setSettled(true), REEL_TOTAL_MS);
    return () => clearTimeout(id);
  }, [play, ticket]);

  return (
    <div
      data-testid="ticket-card"
      data-settled={settled}
      className="flex flex-col items-center gap-4"
    >
      <div aria-hidden="true" className="flex items-center gap-1 sm:gap-2">
        {ticket.split('').map((char, index) => (
          <ReelChar key={`${ticket}-${index}`} char={char} index={index} play={play} />
        ))}
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
      <TicketActions
        ticket={ticket}
        playerName={playerName}
        issuedAt={issuedAt}
        trackingToken={trackingToken}
      />
      {/* Объявляется один раз, когда билет «остановился». */}
      <p role="status" aria-live="polite" className="sr-only">
        {settled ? `Ваш билет ${ticket.split('').join(' ')}, игрок ${playerName}` : ''}
      </p>
    </div>
  );
}
