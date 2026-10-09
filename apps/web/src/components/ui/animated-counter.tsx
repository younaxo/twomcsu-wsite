'use client';

import { useEffect, useRef, useState, type HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import { usePrefersReducedMotion } from '@/lib/use-media-query';

export interface AnimatedCounterProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  value: number;
  /// Длительность count-up в мс; при `prefers-reduced-motion` игнорируется.
  duration?: number;
  /// Форматирование промежуточных и финального значений (по умолчанию
  /// `formatNumber` с округлением).
  format?: (value: number) => string;
}

const defaultFormat = (value: number): string => formatNumber(Math.round(value));

const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

/// Счётчик с анимацией «набегания» (статистика сервера, онлайн, баланс).
/// Анимация через requestAnimationFrame с ease-out; при reduced-motion —
/// сразу финальное значение. Screen reader слышит только финальное число.
export function AnimatedCounter({
  value,
  duration = 800,
  format = defaultFormat,
  className,
  ...props
}: AnimatedCounterProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [display, setDisplay] = useState(value);
  // Текущее показанное значение — новая анимация стартует с него, а не с нуля.
  const displayRef = useRef(value);

  useEffect(() => {
    const from = displayRef.current;
    const to = value;
    if (reducedMotion || duration <= 0 || from === to) {
      displayRef.current = to;
      setDisplay(to);
      return;
    }
    const startedAt = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const current = from + (to - from) * easeOutCubic(progress);
      displayRef.current = current;
      setDisplay(current);
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration, reducedMotion]);

  const finalText = format(value);
  return (
    <span aria-live="off" className={cn('tabular', className)} {...props}>
      <span aria-hidden>{format(display)}</span>
      <span className="sr-only">{finalText}</span>
    </span>
  );
}
