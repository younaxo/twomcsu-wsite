'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';
import { SiteLogo } from '@/components/shell/site-logo';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { AuthModeSwitch, type AuthMode } from './auth-mode-switch';
import { AuthVisual } from './auth-visual';

/// Единая auth-панель «Полдня» (ADR-0071): широкий горизонтальный остров —
/// слева логотип, переключатель «Вход | Регистрация» и форма шага, справа
/// визуал проекта. На mobile визуал — компактный баннер сверху (на самых узких
/// экранах скрыт). Используется layout'ом `app/(auth)` для входа, регистрации,
/// восстановления/сброса пароля и экранов результата Discord/Telegram, поэтому
/// при переходах между ними панель не перемонтируется. Solid, без glass.
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="flex items-center justify-between px-4 py-3 md:px-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="size-4" />
          На сайт
        </Link>
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-start justify-center px-3 pb-10 sm:px-4 md:items-center md:px-6">
        <AuthPanel>{children}</AuthPanel>
      </main>
    </div>
  );
}

/// Сам остров auth-панели (без шапки страницы) — им же пользуется design-lab.
/// `mode` — явный режим переключателя для превью (на сайте — по URL).
export function AuthPanel({ children, mode }: { children: ReactNode; mode?: AuthMode }) {
  return (
    <div
      data-testid="auth-panel"
      className="grid w-full max-w-[1120px] overflow-hidden rounded-2xl bg-surface-raised shadow-lg edge-highlight lg:min-h-[640px] lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]"
    >
      <AuthVisual compact className="max-[379px]:hidden lg:hidden" />
      <section
        aria-labelledby="auth-title"
        className="flex min-w-0 flex-col gap-6 px-5 py-6 sm:p-8 lg:p-12"
      >
        <SiteLogo size={36} wordmarkSize="lg" className="self-start" />
        <Suspense fallback={null}>
          <AuthModeSwitch mode={mode} />
        </Suspense>
        {children}
      </section>
      <AuthVisual className="hidden lg:flex" />
    </div>
  );
}
