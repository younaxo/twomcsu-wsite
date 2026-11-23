'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useModuleAvailability } from '@/lib/site/status';

const SECTIONS = [
  { href: '/settings', label: 'Профиль' },
  { href: '/settings/privacy', label: 'Приватность' },
  { href: '/settings/notifications', label: 'Уведомления' },
  { href: '/settings/security', label: 'Безопасность' },
  { href: '/settings/punishments', label: 'Наказания' },
  { href: '/settings/media', label: 'Медиа' },
  { href: '/settings/showcase', label: 'Витрина' },
  { href: '/settings/linked-accounts', label: 'Привязки' },
  { href: '/settings/wallet', label: 'Кошелёк' },
  { href: '/settings/purchases', label: 'История покупок', module: 'store' },
] as const;

/// Настройки аккаунта (волна 1): общая навигация разделов.
export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // Раздел модуля скрыт, пока модуль магазина выключен.
  const store = useModuleAvailability('store');
  const sections = SECTIONS.filter((section) => !('module' in section) || !store.reason);
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-3 py-6 md:px-6">
      <nav aria-label="Разделы настроек" className="flex gap-1 overflow-x-auto">
        {sections.map((section) => {
          const active = pathname === section.href;
          return (
            <Link
              key={section.href}
              href={section.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-10 shrink-0 items-center rounded-md px-3 text-sm font-medium transition-colors duration-fast',
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
