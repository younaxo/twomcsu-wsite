import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { SiteLogo } from '@/components/shell/site-logo';
import { ThemeToggle } from '@/components/ui/theme-toggle';

/// Общая оболочка auth-экранов «Полдня» (вход, регистрация, восстановление и
/// сброс пароля): логотип + twomc.su, переключатель темы, одна solid-карточка
/// по центру, ссылки между экранами. Без glass.
export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="flex items-center justify-between px-4 py-3 md:px-6">
        <SiteLogo />
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm">
          <section
            aria-labelledby="auth-title"
            className="rounded-xl border bg-surface-raised p-6 shadow-lg edge-highlight md:p-8"
          >
            <h1 id="auth-title" className="font-display text-2xl font-bold tracking-tight">
              {title}
            </h1>
            {description ? (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            ) : null}
            <div className="mt-6">{children}</div>
          </section>
          {footer ? (
            <div className="mt-4 flex flex-col items-center gap-2 text-center text-sm text-muted-foreground">
              {footer}
            </div>
          ) : null}
          <p className="mt-6 text-center">
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft aria-hidden className="size-4" />
              На сайт
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
