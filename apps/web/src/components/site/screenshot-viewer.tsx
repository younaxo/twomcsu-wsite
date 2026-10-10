'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useRef, type KeyboardEvent } from 'react';
import { IconButton } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { PROJECT_SCREENSHOTS, type ProjectScreenshot } from '@/lib/site/project-screenshots';
import { ScreenshotPicture } from './screenshot-picture';

/// Просмотр скриншота крупно (ADR-0096) — production Dialog: кадр целиком
/// (contain, без обрезки), ← → и свайп, Escape закрывает, фокус остаётся в
/// окне. Не отдельная вкладка браузера.
export function ScreenshotViewer({
  shots = PROJECT_SCREENSHOTS,
  index,
  onIndexChange,
  onClose,
}: {
  shots?: readonly ProjectScreenshot[];
  /// null — закрыт.
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const touchX = useRef<number | null>(null);
  const count = shots.length;
  const shot = index === null ? null : shots[index];
  const go = (delta: number) => {
    if (index === null) return;
    onIndexChange((index + delta + count) % count);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowRight') go(1);
    else if (event.key === 'ArrowLeft') go(-1);
    else return;
    event.preventDefault();
  };

  return (
    <Dialog open={shot != null} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent
        className="max-w-[min(94vw,1400px)] gap-0 overflow-hidden p-0"
        onKeyDown={onKeyDown}
        data-testid="screenshot-viewer"
      >
        {shot ? (
          <>
            <div
              className="relative aspect-[1920/1009] w-full bg-black"
              onTouchStart={(event) => {
                touchX.current = event.touches[0]?.clientX ?? null;
              }}
              onTouchEnd={(event) => {
                const start = touchX.current;
                const end = event.changedTouches[0]?.clientX;
                touchX.current = null;
                if (start === null || end === undefined) return;
                if (end - start > 40) go(-1);
                else if (start - end > 40) go(1);
              }}
            >
              <ScreenshotPicture
                shot={shot}
                sizes="94vw"
                className="absolute inset-0 size-full !object-contain"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <DialogTitle className="font-display text-lg font-bold">{shot.title}</DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground">
                  {shot.description}
                </DialogDescription>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs tabular-nums text-subtle-foreground">
                  {index! + 1} / {count}
                </span>
                <IconButton size="sm" aria-label="Предыдущий кадр" onClick={() => go(-1)}>
                  <ChevronLeft />
                </IconButton>
                <IconButton size="sm" aria-label="Следующий кадр" onClick={() => go(1)}>
                  <ChevronRight />
                </IconButton>
              </div>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
