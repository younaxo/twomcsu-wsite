'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { usePrefersReducedMotion } from './hooks';

/// Появление при прокрутке в обе стороны (IntersectionObserver не отключается):
/// вышел из экрана - снова скрыт, вошёл - лёгкий подъём и проявление. При prefers-reduced-motion,
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
        const last = entries[entries.length - 1];
        if (last) setState(last.isIntersecting ? 'shown' : 'hidden');
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [reduced]);

  return (
    <div
      ref={ref}
      data-reveal={state}
      className={cn(
        'motion-safe:transition-[opacity,transform] motion-safe:duration-500 motion-safe:ease-out',
        state === 'hidden' && 'translate-y-4 opacity-0',
        className,
      )}
    >
      {children}
    </div>
  );
}
