'use client';

import { ChevronLeft, ChevronRight, Expand, Pause, Play } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/cn';
import { PROJECT_SCREENSHOTS, type ProjectScreenshot } from '@/lib/site/project-screenshots';
import { usePrefersReducedMotion } from '@/lib/use-media-query';
import { ScreenshotPicture } from './screenshot-picture';

/// Карусель реальных скриншотов (D3, ADR-0096) — один production-компонент для
/// Auth (правая половина на desktop, компактный кадр на mobile), design-lab и
/// сайта. Только изображение и управление поверх него: без заголовков, подписей
/// и логотипа (что на кадре — в alt для screen reader).
///
/// - Автопрокрутка каждые 6 с, мягкий fade 400 мс (без zoom/flip).
/// - Пауза: наведение, фокус внутри, вкладка в фоне, кнопка «Пауза»; после
///   ручного переключения — пауза 12 с и мягкое продолжение.
/// - Ручное управление: ← →, точки, свайп, клавиатура (←/→/Home/End).
/// - Reduced motion: без автопрокрутки и анимации переходов.
/// - Загрузка: первый кадр — eager/high, следующий — заранее, остальные — когда
///   до них дошли (не 8 полноразмерных файлов сразу).

export const CAROUSEL_INTERVAL_MS = 6000;
export const CAROUSEL_RESUME_MS = 12000;
const SWIPE_PX = 40;

/// `fill` заполняет родителя целиком (object-cover): в узкой и высокой
/// половине кадр 1,9:1 рисуется шире контейнера — `sizes` по фактической
/// ширине отрисовки (≈1100–1500 px: вход ниже, регистрация выше), иначе браузер возьмёт слишком маленький
/// файл и будет мыло.
const FILL_SIZES = '(min-width: 1024px) 1600px, 100vw';

/// Тёмная solid-плашка управления поверх кадра (без blur): читается на любом
/// скриншоте и не затемняет сам кадр.
function OverlayButton({
  label,
  onClick,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className="flex size-8 items-center justify-center rounded-md text-white transition-colors duration-fast hover:bg-white/15 [&_svg]:size-4"
    >
      {children}
    </button>
  );
}

export function ScreenshotCarousel({
  shots = PROJECT_SCREENSHOTS,
  variant = 'fill',
  autoplay = true,
  interval = CAROUSEL_INTERVAL_MS,
  initialIndex = 0,
  sizes,
  label = 'Скриншоты TwoMC',
  onOpen,
  forceReducedMotion = false,
  priority = true,
  className,
}: {
  shots?: readonly ProjectScreenshot[];
  /// `fill` — кадр на всю площадь родителя, управление поверх (desktop Auth);
  /// `compact` — кадр 16:6 с точками поверх (mobile).
  variant?: 'fill' | 'compact';
  autoplay?: boolean;
  interval?: number;
  initialIndex?: number;
  sizes?: string;
  label?: string;
  /// Открыть кадр крупно (production Dialog) — маленькая кнопка справа сверху.
  onOpen?: (shot: ProjectScreenshot, index: number) => void;
  /// Design-lab: показать поведение «уменьшения движения» без системной настройки.
  forceReducedMotion?: boolean;
  /// Первый кадр — с приоритетом (над сгибом). false — для скрытого варианта
  /// (lazy + display:none → браузер его не грузит).
  priority?: boolean;
  className?: string;
}) {
  const count = shots.length;
  const reduced = usePrefersReducedMotion() || forceReducedMotion;
  const [index, setIndex] = useState(() => (count ? initialIndex % count : 0));
  const [loaded, setLoaded] = useState<ReadonlySet<number>>(() => new Set([initialIndex]));
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [visible, setVisible] = useState(true);
  const [holdUntil, setHoldUntil] = useState(0);
  const touchX = useRef<number | null>(null);

  const running = autoplay && !reduced && !stopped && !hovered && !focused && visible && count > 1;

  const show = useCallback(
    (next: number, manual: boolean) => {
      if (!count) return;
      const target = (next + count) % count;
      setIndex(target);
      setLoaded((prev) => (prev.has(target) ? prev : new Set(prev).add(target)));
      if (manual) setHoldUntil(Date.now() + CAROUSEL_RESUME_MS);
    },
    [count],
  );

  // Вкладка в фоне — не крутим (и не тратим трафик).
  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== 'hidden');
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  useEffect(() => {
    if (!running) return;
    const delay = Math.max(interval, holdUntil - Date.now());
    const id = window.setTimeout(() => show(index + 1, false), delay);
    return () => window.clearTimeout(id);
  }, [running, index, interval, holdUntil, show]);

  if (!count) return null;
  const current = shots[index]!;
  // Текущий и следующий — заранее; остальные — когда до них дошли.
  const near = (i: number) => loaded.has(i) || i === index || i === (index + 1) % count;
  const compact = variant === 'compact';

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowRight') show(index + 1, true);
    else if (event.key === 'ArrowLeft') show(index - 1, true);
    else if (event.key === 'Home') show(0, true);
    else if (event.key === 'End') show(count - 1, true);
    else return;
    event.preventDefault();
  };

  return (
    <section
      aria-roledescription="карусель"
      aria-label={label}
      tabIndex={0}
      data-testid="screenshot-carousel"
      data-variant={variant}
      data-index={index}
      data-running={running || undefined}
      onKeyDown={onKeyDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
      onTouchStart={(event) => {
        touchX.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        const start = touchX.current;
        const end = event.changedTouches[0]?.clientX;
        touchX.current = null;
        if (start === null || end === undefined) return;
        if (end - start > SWIPE_PX) show(index - 1, true);
        else if (start - end > SWIPE_PX) show(index + 1, true);
      }}
      className={cn(
        'relative isolate w-full overflow-hidden bg-surface-sunken',
        compact ? 'aspect-[16/6]' : 'size-full',
        className,
      )}
    >
      {shots.map((shot, i) => (
        <div
          key={shot.id}
          role="group"
          aria-roledescription="кадр"
          aria-label={`${i + 1} из ${count}: ${shot.title}`}
          aria-hidden={i === index ? undefined : true}
          data-slide={shot.id}
          data-active={i === index || undefined}
          className={cn(
            'absolute inset-0 transition-opacity duration-[400ms] ease-out motion-reduce:transition-none',
            forceReducedMotion && 'transition-none',
            i === index ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
        >
          {near(i) ? (
            <ScreenshotPicture
              shot={shot}
              priority={priority && i === initialIndex}
              sizes={sizes ?? (compact ? '100vw' : FILL_SIZES)}
              className="absolute inset-0 size-full"
            />
          ) : null}
        </div>
      ))}

      {onOpen && !compact ? (
        <div className="absolute right-3 top-3 rounded-md bg-black/55">
          <OverlayButton
            label={`Открыть «${current.title}» крупно`}
            onClick={() => onOpen(current, index)}
          >
            <Expand />
          </OverlayButton>
        </div>
      ) : null}

      {/* Лёгкий градиент только под управлением — сам кадр не затемнён. */}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/40 to-transparent',
          compact ? 'h-10' : 'h-20',
        )}
      />
      <div
        className={cn(
          'absolute inset-x-0 bottom-0 flex items-center justify-between gap-3',
          compact ? 'px-3 pb-1.5' : 'px-4 pb-4',
        )}
      >
        <div
          className="flex items-center rounded-full bg-black/45 px-1.5"
          data-testid="carousel-dots"
        >
          {shots.map((shot, i) => (
            <button
              key={shot.id}
              type="button"
              aria-label={`Кадр ${i + 1}: ${shot.title}`}
              aria-current={i === index ? 'true' : undefined}
              onClick={() => show(i, true)}
              className="group/dot flex h-6 items-center px-1"
            >
              <span
                aria-hidden
                className={cn(
                  'block h-1.5 rounded-full transition-[width,background-color] duration-fast motion-reduce:transition-none',
                  i === index ? 'w-5 bg-primary' : 'w-1.5 bg-white/60 group-hover/dot:bg-white',
                )}
              />
            </button>
          ))}
        </div>
        {compact ? null : (
          <div className="flex items-center gap-0.5 rounded-md bg-black/55 p-0.5">
            {autoplay && !reduced ? (
              <OverlayButton
                label={stopped ? 'Включить автопрокрутку' : 'Остановить автопрокрутку'}
                pressed={stopped}
                onClick={() => setStopped((value) => !value)}
              >
                {stopped ? <Play /> : <Pause />}
              </OverlayButton>
            ) : null}
            <OverlayButton label="Предыдущий кадр" onClick={() => show(index - 1, true)}>
              <ChevronLeft />
            </OverlayButton>
            <OverlayButton label="Следующий кадр" onClick={() => show(index + 1, true)}>
              <ChevronRight />
            </OverlayButton>
          </div>
        )}
      </div>
      {/* Для screen reader: что сейчас показано (при ручном переключении). */}
      <p className="sr-only" aria-live={running ? 'off' : 'polite'}>
        {`${index + 1} из ${count}: ${current.title}`}
      </p>
    </section>
  );
}
