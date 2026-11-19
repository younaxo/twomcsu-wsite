'use client';

import { useEffect, useState } from 'react';

/// Алфавит билета: A-Z без I и O (как на сервере) и цифры.
export const REEL_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const REEL_DIGITS = '0123456789';
/// Момент остановки каждого символа слева направо; вся анимация ~3 с.
export const REEL_STOP_MS = [2100, 2400, 2700, 3000] as const;
export const REEL_TOTAL_MS = REEL_STOP_MS[REEL_STOP_MS.length - 1]!;
/// Плавное торможение: умеренный старт, мягкая остановка.
const EASING = 'cubic-bezier(0.25, 0.8, 0.35, 1)';
const WINDOW_EM = 1.6;
/// Отступ ленты сверху: итоговый символ стоит по центру окна, по бокам виден соседний.
const PAD_EM = (WINDOW_EM - 1) / 2;
const MASK = 'linear-gradient(to bottom, transparent 0%, #000 28%, #000 72%, transparent 100%)';

export function reelPool(index: number): string {
  return index === 0 ? REEL_LETTERS : REEL_DIGITS;
}

/// Лента символов: подряд идущие по алфавиту, последний - итоговый. Символы
/// настоящие и читаемы при движении; длина растёт слева направо.
export function reelSequence(final: string, index: number): string[] {
  const pool = reelPool(index);
  const at = Math.max(0, pool.indexOf(final));
  const length = 10 + index * 2 + 1;
  return Array.from({ length }, (_, k) => {
    if (k === length - 1) return final;
    const back = length - 1 - k;
    return pool[(((at - back) % pool.length) + pool.length) % pool.length]!;
  });
}

/// Один символ билета: вертикальная лента, прокрутка вверх с ease-out. Без рамок и
/// подсветки; цвет текста - акцент сайта; сверху и снизу маска затухания.
export function ReelChar({ char, index, play }: { char: string; index: number; play: boolean }) {
  const [go, setGo] = useState(false);
  const [done, setDone] = useState(!play);
  useEffect(() => {
    if (!play) {
      setDone(true);
      return;
    }
    setDone(false);
    setGo(false);
    const start = setTimeout(() => setGo(true), 30);
    const stop = setTimeout(() => setDone(true), REEL_STOP_MS[index] ?? REEL_TOTAL_MS);
    return () => {
      clearTimeout(start);
      clearTimeout(stop);
    };
  }, [play, char, index]);

  const seq = done ? [char] : reelSequence(char, index);
  const end = PAD_EM - (seq.length - 1);
  const duration = (REEL_STOP_MS[index] ?? REEL_TOTAL_MS) - 30;
  return (
    <span
      data-testid="ticket-char"
      data-done={done}
      className="relative inline-block overflow-hidden text-center font-mono text-5xl font-bold leading-none tabular-nums text-primary sm:text-7xl"
      style={{
        height: `${WINDOW_EM}em`,
        width: '0.75em',
        maskImage: MASK,
        WebkitMaskImage: MASK,
      }}
    >
      <span
        data-testid="ticket-reel"
        className="block"
        style={{
          transform: `translateY(${done || go ? end : PAD_EM}em)`,
          transition: done || !go ? 'none' : `transform ${duration}ms ${EASING}`,
        }}
      >
        {seq.map((c, i) => (
          <span key={i} className="flex h-[1em] items-center justify-center">
            {c}
          </span>
        ))}
      </span>
    </span>
  );
}
