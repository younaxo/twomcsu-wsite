'use client';

import { ArrowLeft, BookOpen } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { SiteLogo } from '@/components/shell/site-logo';
import { Button } from '@/components/ui/button';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/cn';
import { useOnboardingQueue } from '@/lib/onboarding';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { shouldShowAuthTutorial, TUTORIAL_SHOWN_KEY } from '@/lib/auth/tutorial';
import { AuthTutorial } from './auth-tutorial';
import { AuthModeSwitch, type AuthMode } from './auth-mode-switch';
import { AuthVisual } from './auth-visual';

/// Единая auth-панель «Полдня» (ADR-0071): широкий горизонтальный остров —
/// слева логотип, переключатель «Вход | Регистрация» и форма шага, справа
/// визуал проекта. На mobile визуал — компактный баннер сверху (на самых узких
/// экранах скрыт). Используется layout'ом `app/(auth)` для входа, регистрации,
/// восстановления/сброса пароля и экранов результата Discord/Telegram, поэтому
/// при переходах между ними панель не перемонтируется. Solid, без glass.
function readShown(): boolean {
  try {
    return window.sessionStorage.getItem(TUTORIAL_SHOWN_KEY) === '1';
  } catch {
    return false;
  }
}

function markShown() {
  try {
    window.sessionStorage.setItem(TUTORIAL_SHOWN_KEY, '1');
  } catch {
    // Хранилище недоступно (приватный режим) — откроется при следующем входе.
  }
}

/// Registration Spotlight (A11): при ВХОДЕ в регистрацию (смена маршрута на
/// `/register`, не каждый render; один раз за вкладку) — затемнение и
/// coachmark у кнопки «Как зарегистрироваться». Tutorial открывает сам
/// человек: кнопкой в шапке или в coachmark. На «Вход» spotlight нет.
function useRegistrationSpotlight() {
  const pathname = usePathname();
  const [spotlight, setSpotlight] = useState(false);
  const [tutorial, setTutorial] = useState(false);
  useEffect(() => {
    if (!shouldShowAuthTutorial({ pathname, shown: readShown() })) {
      setSpotlight(false);
      return;
    }
    // После гидрации формы (она в Suspense): иначе Radix ставит aria-hidden
    // на ещё не гидрированную разметку.
    const id = window.setTimeout(() => {
      markShown();
      // Регистрация — самая важная подсказка в очереди onboarding (ADR-0097).
      useOnboardingQueue.getState().claim('registration');
      setSpotlight(true);
    }, 350);
    return () => window.clearTimeout(id);
  }, [pathname]);
  const release = () => useOnboardingQueue.getState().release('registration');
  return {
    spotlight,
    tutorial,
    dismiss: () => {
      setSpotlight(false);
      release();
    },
    openTutorial: () => {
      setSpotlight(false);
      release();
      setTutorial(true);
    },
    setTutorial,
  };
}

/// Содержимое подсказки spotlight (A11) — и на сайте, и в design-lab.
export function SpotlightCoachmark({
  onTutorial,
  onDismiss,
}: {
  onTutorial: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold">Впервые здесь?</p>
        <p className="text-sm text-muted-foreground">
          Посмотрите короткую инструкцию по регистрации.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={onTutorial}>
          Как зарегистрироваться
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          Мне понятно
        </Button>
      </div>
    </div>
  );
}

/// Кнопка «Как зарегистрироваться» и spotlight вокруг неё (A11): coachmark —
/// production Popover у самой кнопки, сплошное затемнение (без blur/glass)
/// под ней; клик по затемнению или Escape — закрыть. И в шапке auth, и в
/// design-lab.
export function RegistrationSpotlight({
  active,
  onTutorial,
  onDismiss,
}: {
  active: boolean;
  onTutorial: () => void;
  onDismiss: () => void;
}) {
  return (
    <>
      <Popover open={active} onOpenChange={(open) => (open ? null : onDismiss())}>
        <PopoverAnchor asChild>
          <Button
            variant="ghost"
            size="sm"
            data-spotlight={active || undefined}
            onClick={onTutorial}
            className={cn(
              active &&
                'relative z-dropdown bg-surface-raised shadow-lg ring-2 ring-primary hover:bg-surface-raised',
            )}
          >
            <BookOpen />
            Как зарегистрироваться
          </Button>
        </PopoverAnchor>
        <PopoverContent
          side="bottom"
          align="end"
          arrow
          className="w-72"
          aria-label="Подсказка по регистрации"
          data-testid="registration-spotlight"
        >
          <SpotlightCoachmark onTutorial={onTutorial} onDismiss={onDismiss} />
        </PopoverContent>
      </Popover>
      {active ? (
        <div
          aria-hidden
          data-testid="auth-spotlight-dim"
          className="fixed inset-0 z-overlay bg-black/45 animate-fade-in motion-reduce:animate-none"
          onClick={onDismiss}
        />
      ) : null}
    </>
  );
}

export function AuthLayout({ children }: { children: ReactNode }) {
  const flow = useRegistrationSpotlight();
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="flex items-center justify-between px-4 py-2.5 md:px-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="size-4" />
          На сайт
        </Link>
        <div className="flex items-center gap-1">
          <RegistrationSpotlight
            active={flow.spotlight}
            onTutorial={flow.openTutorial}
            onDismiss={flow.dismiss}
          />
          <ThemeToggle />
        </div>
      </header>
      <AuthTutorial open={flow.tutorial} onOpenChange={flow.setTutorial} />
      <main className="flex flex-1 items-start justify-center px-3 pb-6 sm:px-4 md:items-center md:px-6">
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
      className="grid w-full max-w-[1120px] overflow-hidden rounded-2xl bg-surface-raised shadow-lg lg:grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)]"
    >
      <AuthVisual compact className="lg:hidden" />
      <section
        aria-labelledby="auth-title"
        className="flex min-w-0 flex-col gap-5 px-5 py-6 sm:px-8 sm:py-7 lg:px-10 lg:py-8"
      >
        {/* Логотип и «Вход | Регистрация» — одной строкой (на узких — друг под другом). */}
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
          <SiteLogo size={36} wordmarkSize="lg" />
          <Suspense fallback={null}>
            <AuthModeSwitch mode={mode} className="w-full sm:w-64" />
          </Suspense>
        </div>
        {children}
      </section>
      <AuthVisual className="hidden lg:block" />
    </div>
  );
}
