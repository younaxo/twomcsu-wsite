'use client';

import { Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { usePrefersReducedMotion } from '@/lib/use-media-query';
import { IconButton } from './button';

export interface MarqueeProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /// Скорость в px/с.
  speed?: number;
  pauseOnHover?: boolean;
  direction?: 'left' | 'right';
}

/// Бегущая строка (партнёры, новости, онлайн-события). Содержимое дублируется,
/// анимация — Web Animations API (без keyframes в конфиге Tailwind).
/// При reduced-motion — статичная прокручиваемая строка. Кнопка «Пауза»
/// обязательна: движение дольше 5 с должно останавливаться пользователем.
export function Marquee({
  children,
  speed = 60,
  pauseOnHover = true,
  direction = 'left',
  className,
  ...props
}: MarqueeProps) {
  const reducedMotion = usePrefersReducedMotion();
  const trackRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<Animation | null>(null);
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const shouldPause = paused || (pauseOnHover && hovered);

  useEffect(() => {
    pausedRef.current = shouldPause;
    const animation = animationRef.current;
    if (!animation) {
      return;
    }
    if (shouldPause) {
      animation.pause();
    } else {
      animation.play();
    }
  }, [shouldPause]);

  useEffect(() => {
    const track = trackRef.current;
    const copy = copyRef.current;
    if (reducedMotion || !track || !copy || typeof track.animate !== 'function') {
      return;
    }
    const start = () => {
      animationRef.current?.cancel();
      animationRef.current = null;
      const distance = copy.getBoundingClientRect().width;
      if (distance <= 0 || speed <= 0) {
        return;
      }
      const animation = track.animate(
        [{ transform: 'translateX(0)' }, { transform: `translateX(-${distance}px)` }],
        {
          duration: (distance / speed) * 1000,
          iterations: Infinity,
          easing: 'linear',
          direction: direction === 'right' ? 'reverse' : 'normal',
        },
      );
      if (pausedRef.current) {
        animation.pause();
      }
      animationRef.current = animation;
    };
    start();
    // Содержимое может догрузиться (шрифты, картинки) — пересчитываем дистанцию.
    const observer = new ResizeObserver(start);
    observer.observe(copy);
    return () => {
      observer.disconnect();
      animationRef.current?.cancel();
      animationRef.current = null;
    };
  }, [reducedMotion, speed, direction]);

  if (reducedMotion) {
    return (
      <div
        className={cn('overflow-x-auto overscroll-x-contain scrollbar-thin', className)}
        {...props}
      >
        <div className="flex w-max items-center gap-8 py-1">{children}</div>
      </div>
    );
  }

  return (
    <div
      className={cn('relative flex items-center gap-2', className)}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      {...props}
    >
      <div className="min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)]">
        <div ref={trackRef} className="flex w-max will-change-transform">
          <div ref={copyRef} className="flex shrink-0 items-center gap-8 py-1 pr-8">
            {children}
          </div>
          <div aria-hidden className="flex shrink-0 items-center gap-8 py-1 pr-8">
            {children}
          </div>
        </div>
      </div>
      <IconButton
        size="sm"
        aria-label={paused ? 'Продолжить прокрутку' : 'Приостановить прокрутку'}
        aria-pressed={paused}
        onClick={() => setPaused((value) => !value)}
        className="shrink-0"
      >
        {paused ? <Play /> : <Pause />}
      </IconButton>
    </div>
  );
}
