'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/cn';
import { usePrefersReducedMotion } from '@/lib/use-media-query';
import { IconButton } from './button';

/// Carousel — прототип на CSS scroll-snap: свайп нативный, кнопки/точки/
/// клавиатура докручивают к слайду. Без автопрокрутки.

export interface CarouselSlideProps extends HTMLAttributes<HTMLDivElement> {
  /// Проставляется `Carousel` автоматически — для aria-label «Слайд N из M».
  index?: number;
  total?: number;
}

export const CarouselSlide = forwardRef<HTMLDivElement, CarouselSlideProps>(
  ({ index, total, className, ...props }, ref) => (
    <div
      ref={ref}
      role="group"
      aria-roledescription="slide"
      aria-label={
        index !== undefined && total !== undefined ? `Слайд ${index + 1} из ${total}` : undefined
      }
      className={cn('w-full shrink-0 snap-start', className)}
      {...props}
    />
  ),
);
CarouselSlide.displayName = 'CarouselSlide';

export interface CarouselProps extends HTMLAttributes<HTMLDivElement> {
  /// Доступное имя региона.
  label?: string;
  children: ReactNode;
  showArrows?: boolean;
  showDots?: boolean;
  onIndexChange?: (index: number) => void;
}

export const Carousel = forwardRef<HTMLDivElement, CarouselProps>(
  (
    {
      label = 'Карусель',
      children,
      showArrows = true,
      showDots = true,
      onIndexChange,
      className,
      ...props
    },
    ref,
  ) => {
    const reducedMotion = usePrefersReducedMotion();
    const viewportRef = useRef<HTMLDivElement>(null);
    const [index, setIndex] = useState(0);
    const indexRef = useRef(0);
    const onIndexChangeRef = useRef(onIndexChange);
    useEffect(() => {
      onIndexChangeRef.current = onIndexChange;
    }, [onIndexChange]);

    const slides = Children.toArray(children).filter(
      (child): child is ReactElement<CarouselSlideProps> => isValidElement(child),
    );
    const count = slides.length;

    // Индекс активного слайда — ближайший к левому краю после нативного скролла.
    useEffect(() => {
      const viewport = viewportRef.current;
      if (!viewport) {
        return;
      }
      let frame = 0;
      const onScroll = () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          const items = Array.from(viewport.children) as HTMLElement[];
          let nearest = 0;
          let best = Number.POSITIVE_INFINITY;
          items.forEach((item, itemIndex) => {
            const distance = Math.abs(item.offsetLeft - viewport.scrollLeft);
            if (distance < best) {
              best = distance;
              nearest = itemIndex;
            }
          });
          if (indexRef.current !== nearest) {
            indexRef.current = nearest;
            setIndex(nearest);
            onIndexChangeRef.current?.(nearest);
          }
        });
      };
      viewport.addEventListener('scroll', onScroll, { passive: true });
      return () => {
        viewport.removeEventListener('scroll', onScroll);
        cancelAnimationFrame(frame);
      };
    }, []);

    const scrollTo = useCallback(
      (target: number) => {
        const viewport = viewportRef.current;
        if (!viewport || count === 0) {
          return;
        }
        const next = Math.min(Math.max(0, target), count - 1);
        const slide = viewport.children[next] as HTMLElement | undefined;
        if (!slide) {
          return;
        }
        viewport.scrollTo({ left: slide.offsetLeft, behavior: reducedMotion ? 'auto' : 'smooth' });
      },
      [count, reducedMotion],
    );

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) {
        return;
      }
      const actions: Record<string, number> = {
        ArrowLeft: index - 1,
        ArrowRight: index + 1,
        Home: 0,
        End: count - 1,
      };
      const target = actions[event.key];
      if (target === undefined) {
        return;
      }
      event.preventDefault();
      scrollTo(target);
    };

    return (
      <div
        ref={ref}
        role="region"
        aria-roledescription="carousel"
        aria-label={label}
        className={cn('relative flex flex-col gap-3', className)}
        {...props}
      >
        <div className="relative">
          <div
            ref={viewportRef}
            tabIndex={0}
            aria-label="Слайды"
            onKeyDown={onKeyDown}
            className={cn(
              'relative flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-lg',
              '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
            )}
          >
            {slides.map((slide, slideIndex) =>
              cloneElement(slide, { index: slideIndex, total: count }),
            )}
          </div>
          {showArrows && count > 1 ? (
            <>
              <IconButton
                aria-label="Предыдущий слайд"
                variant="secondary"
                size="sm"
                disabled={index <= 0}
                onClick={() => scrollTo(index - 1)}
                className="absolute left-2 top-1/2 z-10 -translate-y-1/2 shadow"
              >
                <ChevronLeft />
              </IconButton>
              <IconButton
                aria-label="Следующий слайд"
                variant="secondary"
                size="sm"
                disabled={index >= count - 1}
                onClick={() => scrollTo(index + 1)}
                className="absolute right-2 top-1/2 z-10 -translate-y-1/2 shadow"
              >
                <ChevronRight />
              </IconButton>
            </>
          ) : null}
        </div>
        {showDots && count > 1 ? (
          <div className="flex justify-center gap-1">
            {slides.map((_, dotIndex) => (
              <button
                key={dotIndex}
                type="button"
                aria-label={`Слайд ${dotIndex + 1}`}
                aria-current={dotIndex === index ? 'true' : undefined}
                onClick={() => scrollTo(dotIndex)}
                className="flex size-6 items-center justify-center rounded-full"
              >
                <span
                  aria-hidden
                  className={cn(
                    'size-2 rounded-full transition-colors duration-fast',
                    dotIndex === index
                      ? 'bg-primary'
                      : 'bg-border-strong hover:bg-muted-foreground',
                  )}
                />
              </button>
            ))}
          </div>
        ) : null}
        <p aria-live="polite" aria-atomic className="sr-only">
          {count > 0 ? `Слайд ${index + 1} из ${count}` : null}
        </p>
      </div>
    );
  },
);
Carousel.displayName = 'Carousel';
