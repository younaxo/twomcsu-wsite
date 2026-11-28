'use client';

import { currencyAsset, type CurrencyAssetId, type WalletCurrency } from '@twomc/shared';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { cdnUrl, isRubyIconOnCdn } from '@/lib/env';

/// Локальный SVG рубина (public/assets/currencies/ruby.svg): используется по
/// умолчанию, пока ruby.png не загружен на CDN (флаг NEXT_PUBLIC_RUBY_ICON_ON_CDN).
export const RUBY_LOCAL_ICON = '/assets/currencies/ruby.svg';

/// Источник иконки валюты: рубин — локальный SVG, пока CDN-файл явно не включён;
/// остальные — PNG с CDN из реестра.
export function currencyIconSrc(asset: { id: CurrencyAssetId; path: string }): {
  src: string;
  vector: boolean;
} {
  if (asset.id === 'RUBY' && !isRubyIconOnCdn()) {
    return { src: RUBY_LOCAL_ICON, vector: true };
  }
  return { src: cdnUrl(asset.path), vector: false };
}

/// Встроенная заглушка, если картинка не загрузилась: простые Lucide-подобные
/// контуры (рубин — gem, баланс — монета), без сети.
function CurrencyFallback({
  id,
  size,
  label,
  className,
}: {
  id: CurrencyAssetId;
  size: number;
  label: string | null;
  className?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label ?? undefined}
      aria-hidden={label ? undefined : true}
      data-currency={id}
      data-fallback="true"
      className={cn('shrink-0 select-none', className)}
    >
      {id === 'RUBY' ? (
        <>
          <path d="M6 3h12l4 6-10 13L2 9Z" fill="#D7263D" stroke="#7A1224" strokeWidth="1.75" />
          <path d="M11 3 8 9l4 13 4-13-3-6M2 9h20" stroke="#FF8A98" strokeWidth="1.5" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="9" fill="#F26A1B" stroke="#8A3A0A" strokeWidth="1.75" />
          <path d="M12 7v10M9 10h4.5a1.5 1.5 0 0 1 0 3H9" stroke="#FFD2B0" strokeWidth="1.5" />
        </>
      )}
    </svg>
  );
}

/// Иконка валюты TwoMC (ADR-0098): монета для баланса, рубин для рубинов.
/// PNG pixel-art 16×16 с CDN — масштаб только целый (×1 = 16 px, ×2 = 32 px) и
/// `pixelated`; рубин по умолчанию — локальный SVG. Обычно декоративная рядом с
/// подписью валюты; не загрузилась — встроенная SVG-заглушка (подпись остаётся,
/// битой картинки нет).
export function CurrencyIcon({
  currency,
  scale = 1,
  decorative = true,
  className,
}: {
  currency: CurrencyAssetId | WalletCurrency;
  scale?: 1 | 2 | 3;
  /// false — иконка без подписи рядом: тогда у неё есть alt.
  decorative?: boolean;
  className?: string;
}) {
  const asset = currencyAsset(currency);
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <CurrencyFallback
        id={asset.id}
        size={asset.width * scale}
        label={decorative ? null : asset.alt}
        className={className}
      />
    );
  }
  const { src, vector } = currencyIconSrc(asset);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- pixel-art/SVG нельзя ресемплить через next/image
    <img
      src={src}
      alt={decorative ? '' : asset.alt}
      aria-hidden={decorative || undefined}
      width={asset.width * scale}
      height={asset.height * scale}
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
      data-currency={asset.id}
      className={cn('shrink-0 select-none', !vector && '[image-rendering:pixelated]', className)}
    />
  );
}
