'use client';

import { ImageOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import {
  screenshotSrcSet,
  screenshotUrl,
  type ProjectScreenshot,
} from '@/lib/site/project-screenshots';

/// Скриншот проекта (ADR-0096): `<picture>` с AVIF и WebP по ширинам из
/// реестра (без upscale), intrinsic width/height — без CLS. `priority` — только
/// для кадра над сгибом (eager + высокий приоритет загрузки), остальные — lazy.
/// Не загрузился — нейтральная поверхность с названием, без битой картинки.
/// Без размытия и фильтров: кадр остаётся чётким.
export function ScreenshotPicture({
  shot,
  sizes,
  priority = false,
  decorative = false,
  className,
}: {
  shot: ProjectScreenshot;
  /// Атрибут sizes: какая ширина кадра на экране (чтобы не грузить 1920 на телефон).
  sizes: string;
  priority?: boolean;
  /// В карусели с подписью рядом — alt не дублирует подпись.
  decorative?: boolean;
  /// Классы для `<img>` (обычно абсолютное заполнение контейнера).
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [shot.id]);

  if (failed) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center gap-2 bg-surface-sunken text-center text-sm text-muted-foreground',
          className,
        )}
        data-testid="screenshot-fallback"
        role={decorative ? undefined : 'img'}
        aria-label={decorative ? undefined : shot.alt}
      >
        <ImageOff aria-hidden className="size-6 text-subtle-foreground" />
        <span>{shot.title}</span>
      </div>
    );
  }

  // React 18 не знает fetchPriority — атрибут передаётся в DOM как есть.
  const fetchPriority = { fetchpriority: priority ? 'high' : 'auto' } as Record<string, string>;
  return (
    <picture className="contents">
      <source type="image/avif" srcSet={screenshotSrcSet(shot, 'avif')} sizes={sizes} />
      <source type="image/webp" srcSet={screenshotSrcSet(shot, 'webp')} sizes={sizes} />
      {/* eslint-disable-next-line @next/next/no-img-element -- готовые размеры на CDN, без оптимизатора Next */}
      <img
        src={screenshotUrl(shot, 1280, 'webp')}
        alt={decorative ? '' : shot.alt}
        width={shot.width}
        height={shot.height}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        draggable={false}
        onError={() => setFailed(true)}
        data-screenshot={shot.id}
        style={{ objectPosition: shot.objectPosition }}
        className={cn('select-none object-cover', className)}
        {...fetchPriority}
      />
    </picture>
  );
}
