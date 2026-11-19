'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { usePrefersReducedMotion } from './hooks';

/// Появление при прокрутке (IntersectionObserver). При prefers-reduced-motion,
/// без поддержки IntersectionObserver и до гидратации контент виден сразу и
/// без анимации. Сами переходы включены только через `motion-safe:`.
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'idle' | 'hidden' | 'shown'>('idle');

  useEffect(() => {
    const el = ref.current;
    if (reduced || !el || typeof IntersectionObserver === 'undefined') {
      setState('idle');
      return;
    }
    setState('hidden');
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setState('shown');
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [reduced]);

  return (
    <div
      ref={ref}
      data-reveal={state}
      className={cn(
        'motion-safe:transition-[opacity,transform] motion-safe:duration-700 motion-safe:ease-out',
        state === 'hidden' && 'translate-y-6 opacity-0',
        className,
      )}
    >
      {children}
    </div>
  );
}
