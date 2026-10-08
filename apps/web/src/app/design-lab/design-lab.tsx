'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { cn } from '@/lib/cn';
import { useTheme } from '@/lib/theme/theme-provider';
import { DIRECTIONS, DIRECTION_BY_ID, type DirectionId } from './directions';
import { ComponentLab, SHOWCASES } from './directions/registry';
import { labFontVariables } from './fonts';
import { RolePrefixesSection } from './sections/role-prefixes-section';

const SECTIONS = [
  { id: 'direction', label: 'О направлении' },
  { id: 'showcase', label: 'Витрина' },
  { id: 'lab', label: 'Interactions / Component lab' },
  { id: 'prefixes', label: 'Role prefixes' },
] as const;

function useViewportWidth(): number | null {
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setWidth(window.innerWidth);
    update();
    window.addEventListener('resize', update, { passive: true });
    return () => window.removeEventListener('resize', update);
  }, []);
  return width;
}

export function DesignLab({ initialDirection }: { initialDirection: DirectionId }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { resolved: theme } = useTheme();
  const [direction, setDirection] = useState<DirectionId>(initialDirection);
  const spec = DIRECTION_BY_ID[direction];
  const viewport = useViewportWidth();
  /// Тема берётся из глобального переключателя; архивный ember — только тёмный.
  const effectiveTheme = spec.themes.includes(theme) ? theme : spec.themes[0];

  const selectDirection = useCallback(
    (id: DirectionId) => {
      setDirection(id);
      const params = new URLSearchParams(searchParams.toString());
      params.set('d', id);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  // Overlay-примитивы рендерятся порталом в <body>, вне корня лаборатории —
  // зеркалим направление и шрифты архивных кандидатов на <html>. Тема на
  // <html> принадлежит ThemeProvider; для ember временно форсируем тёмную.
  useEffect(() => {
    const root = document.documentElement;
    const fontClasses = labFontVariables.split(' ').filter(Boolean);
    root.setAttribute('data-direction', direction);
    root.classList.add(...fontClasses);
    if (effectiveTheme !== theme) {
      root.setAttribute('data-theme', effectiveTheme);
    }
    return () => {
      root.removeAttribute('data-direction');
      root.classList.remove(...fontClasses);
      root.setAttribute('data-theme', theme);
    };
  }, [direction, effectiveTheme, theme]);

  const Showcase = SHOWCASES[direction];

  return (
    <div
      data-direction={direction}
      data-theme={effectiveTheme}
      className="min-h-screen bg-background font-sans text-foreground"
    >
      {/* Панель лаборатории — нейтральная, НЕ часть направления */}
      <header className="sticky top-0 z-40 border-b bg-surface/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
          <p className="mr-2 text-sm font-semibold">
            TwoMC <span className="text-muted-foreground">· Design lab</span>
          </p>
          <div
            role="radiogroup"
            aria-label="Направление дизайна"
            className="flex rounded bg-surface-sunken p-0.5"
          >
            {DIRECTIONS.map((d) => (
              <button
                key={d.id}
                type="button"
                role="radio"
                aria-checked={d.id === direction}
                onClick={() => selectDirection(d.id)}
                className={cn(
                  'inline-flex h-control-sm items-center gap-1.5 rounded-sm px-3 text-sm transition-colors duration-fast',
                  d.id === direction
                    ? 'bg-surface font-medium text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {d.name}
                {d.status === 'selected' ? (
                  <span
                    aria-label="production-направление"
                    className="size-1.5 rounded-full bg-primary"
                  />
                ) : null}
              </button>
            ))}
          </div>
          {spec.themes.length > 1 ? <ThemeToggle /> : null}
          <nav aria-label="Разделы лаборатории" className="flex flex-wrap gap-1 text-sm">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="rounded-sm px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {s.label}
              </a>
            ))}
          </nav>
          <p className="ml-auto font-mono text-xs tabular text-subtle-foreground" aria-live="off">
            {viewport !== null ? `${viewport}px` : ''}
          </p>
        </div>
      </header>

      <main className="mx-auto flex max-w-[1440px] flex-col gap-16 px-4 py-8">
        <section id="direction" className="scroll-mt-20">
          <DirectionCard direction={direction} />
        </section>

        <section id="showcase" className="scroll-mt-20">
          <SectionHeading
            title="Витрина"
            description="Один набор элементов — navbar, hero, sidebar, кнопки, поля, табы, карточка, таблица, профиль, статус сервера, уведомление, overlay, состояния — в языке выбранного направления."
          />
          <Showcase theme={effectiveTheme} />
        </section>

        <section id="lab" className="scroll-mt-20">
          <SectionHeading
            title="Interactions / Component lab"
            description="Ручная проверка floating UI, overlay, форм и данных. Общие функциональные примитивы, оформление — по токенам направления и темы."
          />
          <ComponentLab />
        </section>

        <section id="prefixes" className="scroll-mt-20">
          <SectionHeading
            title="Role prefixes"
            description="Официальные PNG-префиксы ролей из resource pack (CDN). Только визуализация роли — права определяет backend."
          />
          <RolePrefixesSection />
        </section>
      </main>
    </div>
  );
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-6 flex flex-col gap-1">
      <h2 className="text-2xl">{title}</h2>
      <p className="max-w-3xl text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function DirectionCard({ direction }: { direction: DirectionId }) {
  const spec = DIRECTION_BY_ID[direction];
  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-muted-foreground">Направление</p>
          {spec.status === 'selected' ? (
            <Badge tone="primary">Selected · production direction</Badge>
          ) : (
            <Badge tone="neutral">Archived · alternative</Badge>
          )}
        </div>
        <h1 className="mt-1 text-4xl leading-tight md:text-5xl">{spec.name}</h1>
        <p className="mt-2 text-lg text-muted-foreground">{spec.tagline}</p>
        <p className="mt-6 max-w-prose text-base">{spec.character}</p>
        <p className="mt-3 max-w-prose text-sm text-muted-foreground">{spec.source}</p>
        <p className="mt-6 text-sm">
          <span className="font-medium">Подпись направления: </span>
          {spec.signature}
        </p>
      </div>
      <dl className="grid content-start gap-4 rounded-lg border bg-surface p-card-p text-sm">
        <Row term="Шрифты">
          <span className="font-display text-base">{spec.typography.display}</span>
          {' · '}
          {spec.typography.body}
          {' · '}
          <span className="font-mono">{spec.typography.mono}</span>
          <p className="mt-1 text-muted-foreground">{spec.typography.note}</p>
        </Row>
        <Row term="Оранжевый">
          <span className="inline-flex items-center gap-2">
            <span aria-hidden className="inline-block size-4 rounded-sm bg-primary" />
            {spec.color.orange}{' '}
            <span className="font-mono text-xs text-subtle-foreground">{spec.color.orangeHex}</span>
          </span>
          <p className="mt-1 text-muted-foreground">{spec.color.usage}</p>
        </Row>
        <Row term="Нейтрали">{spec.color.neutrals}</Row>
        <Row term="Поверхности">{spec.surfaces}</Row>
        <Row term="Форма">{spec.shape}</Row>
        <Row term="Плотность">{spec.density}</Row>
        <Row term="Композиция">{spec.composition}</Row>
        <Row term="Движение">{spec.motion}</Row>
        <Row term="Образность">{spec.imagery}</Row>
        <Row term="Риски">
          <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
            {spec.risks.map((risk) => (
              <li key={risk}>{risk}</li>
            ))}
          </ul>
        </Row>
      </dl>
    </div>
  );
}

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[120px_1fr] sm:gap-3">
      <dt className="text-muted-foreground">{term}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}
