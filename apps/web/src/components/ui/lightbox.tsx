'use client';

import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Dialog as RadixDialog } from 'radix-ui';
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { cn } from '@/lib/cn';
import { IconButton } from './button';
import { Spinner } from './spinner';

export interface LightboxImage {
  src: string;
  alt: string;
  caption?: string;
}

export interface LightboxProps {
  images: LightboxImage[];
  /// Индекс текущего изображения (controlled).
  index: number;
  onIndexChange: (index: number) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SWIPE_THRESHOLD_PX = 48;

const overlayButtonClassName =
  'text-background hover:bg-background/15 hover:text-background active:bg-background/25';

/// Lightbox — полноэкранный просмотр галереи (скриншоты сервера, карта).
/// Внешние URL, поэтому обычный `<img>`: размеры заранее неизвестны,
/// картинка вписывается через object-contain + max-h/max-w.
export function Lightbox({ images, index, onIndexChange, open, onOpenChange }: LightboxProps) {
  const total = images.length;
  const current = Math.min(Math.max(0, index), Math.max(0, total - 1));
  const image = images[current];
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const swipeStartRef = useRef<number | null>(null);
  const loaded = image !== undefined && loadedSrc === image.src;
  const hasPrev = current > 0;
  const hasNext = current < total - 1;

  const goTo = (next: number) => {
    if (next >= 0 && next < total) {
      onIndexChange(next);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goTo(current - 1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      goTo(current + 1);
    }
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    swipeStartRef.current = event.pointerType === 'touch' ? event.clientX : null;
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (start === null) {
      return;
    }
    const delta = event.clientX - start;
    if (Math.abs(delta) >= SWIPE_THRESHOLD_PX) {
      goTo(delta < 0 ? current + 1 : current - 1);
    }
  };

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-black/90',
            'data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out',
          )}
        />
        <RadixDialog.Content
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          // Клик по пустой области (не по картинке/кнопкам) закрывает просмотр.
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              onOpenChange(false);
            }
          }}
          className={cn(
            'fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 overscroll-contain p-4 outline-none',
            'data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out',
          )}
        >
          <RadixDialog.Title className="sr-only">
            {image
              ? `Изображение ${current + 1} из ${total}: ${image.alt}`
              : 'Просмотр изображений'}
          </RadixDialog.Title>
          <RadixDialog.Description className="sr-only">
            {image?.caption ?? 'Стрелки влево и вправо переключают изображения, Escape закрывает.'}
          </RadixDialog.Description>

          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-3">
            <span className="pointer-events-auto rounded-sm bg-background/10 px-2 py-1 text-sm text-background tabular">
              {total > 0 ? `${current + 1} / ${total}` : '—'}
            </span>
            <RadixDialog.Close asChild>
              <IconButton
                aria-label="Закрыть"
                className={cn('pointer-events-auto', overlayButtonClassName)}
              >
                <X />
              </IconButton>
            </RadixDialog.Close>
          </div>

          {image ? (
            <figure className="pointer-events-none flex max-h-full max-w-full flex-col items-center gap-3">
              <div className="relative flex items-center justify-center">
                {!loaded ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Spinner
                      size="lg"
                      label="Загрузка изображения…"
                      className="[&_svg]:text-background"
                    />
                  </div>
                ) : null}
                {/* eslint-disable-next-line @next/next/no-img-element -- внешние URL без известных размеров */}
                <img
                  key={image.src}
                  src={image.src}
                  alt={image.alt}
                  draggable={false}
                  onLoad={() => setLoadedSrc(image.src)}
                  className={cn(
                    'pointer-events-auto max-h-[90dvh] max-w-[calc(100vw-2rem)] select-none rounded-sm object-contain shadow-lg',
                    'transition-opacity',
                    loaded ? 'opacity-100' : 'opacity-0',
                  )}
                />
              </div>
              {image.caption ? (
                <figcaption className="pointer-events-auto max-w-prose text-center text-sm text-background/80">
                  {image.caption}
                </figcaption>
              ) : null}
            </figure>
          ) : null}

          {total > 1 ? (
            <>
              <IconButton
                aria-label="Предыдущее изображение"
                disabled={!hasPrev}
                onClick={() => goTo(current - 1)}
                className={cn('absolute left-3 top-1/2 -translate-y-1/2', overlayButtonClassName)}
              >
                <ChevronLeft />
              </IconButton>
              <IconButton
                aria-label="Следующее изображение"
                disabled={!hasNext}
                onClick={() => goTo(current + 1)}
                className={cn('absolute right-3 top-1/2 -translate-y-1/2', overlayButtonClassName)}
              >
                <ChevronRight />
              </IconButton>
            </>
          ) : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
