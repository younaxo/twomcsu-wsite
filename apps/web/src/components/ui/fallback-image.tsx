'use client';

import { ImageOff } from 'lucide-react';
import Image, { type ImageProps } from 'next/image';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface FallbackImageProps extends ImageProps {
  /// Что показать, если файл не загрузился (404, хост не разрешён). По умолчанию
  /// нейтральная поверхность с иконкой: alt-текст на весь блок не выводится.
  fallback?: ReactNode;
  /// Классы заглушки (для `fill` — она сама занимает весь родитель).
  fallbackClassName?: string;
}

/// next/image с честной заглушкой: не загрузилось — `bg-surface-sunken` и
/// Lucide `ImageOff` вместо битой картинки и растянутого alt-текста. Ошибка
/// относится к конкретному `src`, новый `src` её сбрасывает. Для декоративных кадров (`alt=""`) заглушка
/// скрыта от скринридера, для смысловых — `role="img"` с `aria-label`.
export function FallbackImage({
  fallback,
  fallbackClassName,
  onError,
  alt,
  src,
  fill,
  ...props
}: FallbackImageProps) {
  // Ошибка привязана к src, с которым случилась: смена src сразу даёт
  // «не ошибка» в том же рендере, без кадра заглушки и без эффекта-сброса.
  const [failedSrc, setFailedSrc] = useState<typeof src | null>(null);
  const failed = failedSrc !== null && failedSrc === src;
  const imgRef = useRef<HTMLImageElement>(null);

  // Если файл не загрузился до гидрации (404), onError уже отстрелял и React
  // его не увидел: проверяем состояние самого <img> после монтирования.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) {
      setFailedSrc(src);
    }
  }, [src]);

  if (failed) {
    return (
      <div
        data-testid="image-fallback"
        role={alt ? 'img' : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
        className={cn(
          'flex items-center justify-center bg-surface-sunken text-subtle-foreground',
          fill && 'absolute inset-0',
          fallbackClassName,
        )}
      >
        {fallback ?? <ImageOff aria-hidden className="size-6" />}
      </div>
    );
  }
  return (
    <Image
      {...props}
      ref={imgRef}
      src={src}
      alt={alt}
      fill={fill}
      onError={(event) => {
        setFailedSrc(src);
        onError?.(event);
      }}
    />
  );
}
