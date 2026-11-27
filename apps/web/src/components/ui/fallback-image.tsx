'use client';

import { ImageOff } from 'lucide-react';
import Image, { type ImageProps } from 'next/image';
import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface FallbackImageProps extends ImageProps {
  /// Что показать, если файл не загрузился (404, хост не разрешён). По умолчанию
  /// нейтральная поверхность с иконкой: alt-текст на весь блок не выводится.
  fallback?: ReactNode;
  /// Классы заглушки (для `fill` — она сама занимает весь родитель).
  fallbackClassName?: string;
}

/// next/image с честной заглушкой: не загрузилось — `bg-surface-sunken` и
/// Lucide `ImageOff` вместо битой картинки и растянутого alt-текста. Смена `src`
/// сбрасывает состояние ошибки. Для декоративных кадров (`alt=""`) заглушка
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
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

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
      src={src}
      alt={alt}
      fill={fill}
      onError={(event) => {
        setFailed(true);
        onError?.(event);
      }}
    />
  );
}
