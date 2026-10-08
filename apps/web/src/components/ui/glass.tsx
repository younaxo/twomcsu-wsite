'use client';

import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { GLASS_FILTER_ID } from '@/lib/theme/glass';

/// Стеклянные материалы «Полдня» (см. globals.css, GLASS MATERIALS).
///
/// Overlay-примитивы (Popover, Dropdown, Dialog, Dock…) применяют классы
/// `glass-frosted` / `glass-frosted-strong` / `glass-liquid` сами —
/// feature-коду они не нужны. `GlassSurface` — для редких собственных
/// плавающих поверхностей (например, premium action surface над hero),
/// `GlassFilterDefs` монтируется один раз в Providers.

export type GlassMaterial = 'frosted' | 'frosted-strong' | 'liquid';

export interface GlassSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  material?: GlassMaterial;
  /// Принудительно показать solid-fallback (сравнение в /design-lab).
  fallback?: boolean;
}

const materialClassName: Record<GlassMaterial, string> = {
  frosted: 'glass-frosted',
  'frosted-strong': 'glass-frosted-strong',
  liquid: 'glass-liquid',
};

export const GlassSurface = forwardRef<HTMLDivElement, GlassSurfaceProps>(
  ({ material = 'frosted', fallback = false, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-lg text-foreground',
        materialClassName[material],
        fallback && 'glass-fallback',
        className,
      )}
      {...props}
    />
  ),
);
GlassSurface.displayName = 'GlassSurface';

/// SVG-фильтр преломления для `.glass-liquid` в режиме liquid: мягкий
/// шум смещает фон под стеклом на несколько пикселей (feDisplacementMap).
/// Масштаб/частота читаются из токенов при монтировании — одно
/// определение на документ, нулевой размер, вне потока.
export function GlassFilterDefs() {
  return (
    <svg
      aria-hidden
      focusable="false"
      width="0"
      height="0"
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
    >
      <defs>
        <filter
          id={GLASS_FILTER_ID}
          x="0"
          y="0"
          width="100%"
          height="100%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.004 0.006"
            numOctaves="2"
            seed="7"
            result="noise"
          />
          <feGaussianBlur in="noise" stdDeviation="3" result="soft" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="soft"
            scale="10"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  );
}
