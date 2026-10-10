'use client';

import { useState } from 'react';
import { ScreenshotCarousel } from '@/components/site/screenshot-carousel';
import { ScreenshotViewer } from '@/components/site/screenshot-viewer';
import { cn } from '@/lib/cn';
import { useMediaQuery } from '@/lib/use-media-query';

/// Правая часть auth-панели (D3, ADR-0096) — `AuthShowcase`: вся правая
/// половина — один большой скриншот сервера (full-bleed, object-cover,
/// радиус — от самой панели), управление и «развернуть» — поверх кадра.
/// Никакого текста и логотипа: брендинг уже есть в форме слева. Один
/// компонент для входа, регистрации, восстановления и сброса пароля.
/// `compact` — mobile: кадр 16:6 со свайпом и точками, форма остаётся главной.
export function AuthVisual({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const [viewing, setViewing] = useState<number | null>(null);
  // Приоритет загрузки — только видимому варианту (панель с lg, компакт до lg).
  const desktop = useMediaQuery('(min-width: 1024px)');

  if (compact) {
    return (
      <aside aria-label="Скриншоты сервера TwoMC" className={cn('relative', className)}>
        <ScreenshotCarousel variant="compact" label="Скриншоты сервера TwoMC" priority={!desktop} />
      </aside>
    );
  }

  return (
    <aside
      aria-label="Скриншоты сервера TwoMC"
      data-testid="auth-showcase"
      className={cn('relative min-h-[28rem] bg-surface-sunken', className)}
    >
      <ScreenshotCarousel
        variant="fill"
        label="Скриншоты сервера TwoMC"
        priority={desktop}
        className="absolute inset-0"
        onOpen={(_shot, index) => setViewing(index)}
      />
      <ScreenshotViewer
        index={viewing}
        onIndexChange={setViewing}
        onClose={() => setViewing(null)}
      />
    </aside>
  );
}

/// Тот же компонент под именем из ТЗ.
export const AuthShowcase = AuthVisual;
