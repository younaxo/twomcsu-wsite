'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/cn';

export type AuthMode = 'login' | 'register';

const MODES = [
  { href: '/login', label: 'Вход' },
  { href: '/register', label: 'Регистрация' },
] as const;

/// Горизонтальный переключатель «Вход | Регистрация» в стиле SegmentedControl.
/// Это навигация между страницами в общем auth-layout: панель не
/// перемонтируется, поэтому активная подложка плавно сдвигается (без
/// перезагрузки страницы; при reduced-motion — без анимации). `?next=`
/// сохраняется при переключении.
export function AuthModeSwitch({ className, mode }: { className?: string; mode?: AuthMode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const next = searchParams.get('next');
  const current = mode ? `/${mode}` : pathname;
  const activeIndex = MODES.findIndex((item) => current === item.href);
  if (activeIndex === -1) return null;
  return (
    <nav
      aria-label="Вход или регистрация"
      className={cn('relative grid grid-cols-2 rounded bg-background-subtle p-0.5', className)}
    >
      <span
        aria-hidden
        data-testid="auth-mode-indicator"
        className="absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-sm bg-surface-raised shadow-sm transition-transform duration ease-out motion-reduce:transition-none"
        style={{ transform: `translateX(${activeIndex * 100}%)` }}
      />
      {MODES.map((item, index) => (
        <Link
          key={item.href}
          href={next ? `${item.href}?next=${encodeURIComponent(next)}` : item.href}
          replace
          scroll={false}
          aria-current={index === activeIndex ? 'page' : undefined}
          className={cn(
            'relative z-10 flex h-control-sm items-center justify-center rounded-sm text-sm font-medium transition-colors duration-fast',
            index === activeIndex ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
