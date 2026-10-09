'use client';

import Image, { type ImageProps } from 'next/image';
import { cn } from '@/lib/cn';

/// Изображение-ассет twomc.su (ADR-0077): не перетаскивается, не выделяется,
/// без системного меню «Сохранить изображение» на iOS (touch-callout), в
/// контекстном меню сайта — как «изображение twomc.su». Это защита от
/// случайного копирования, а не DRM: DevTools и прямые URL не блокируются.
export function ProtectedImage({ className, alt, ...props }: ImageProps) {
  return (
    <Image
      alt={alt}
      draggable={false}
      onDragStart={(event) => event.preventDefault()}
      data-context="image"
      className={cn('select-none [-webkit-touch-callout:none]', className)}
      {...props}
    />
  );
}
