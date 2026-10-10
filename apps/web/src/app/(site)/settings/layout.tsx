'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

const SECTIONS = [
  { href: '/settings', label: 'Профиль' },
  { href: '/settings/privacy', label: 'Приватность' },
  { href: '/settings/notifications', label: 'Уведомления' },
  { href: '/settings/security', label: 'Безопасность' },
  { href: '/settings/punishments', label: 'Наказания' },
  { href: '/settings/media', label: 'Медиа' },
  { href: '/settings/linked-accounts', label: 'Привязки' },
] as const;

/// Настройки аккаунта (волна 1): общая навигация разделов.
export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-3 py-6 md:px-6">
      <nav aria-label="Разделы настроек" className="flex gap-1 overflow-x-auto">
        {SECTIONS.map((section) => {
          const active = pathname === section.href;
          return (
            <Link
              key={section.href}
              href={section.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-fast',
                active
                  ? 'bg-surface text-primary shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {section.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
