'use client';

import { currencyAsset, type CurrencyAssetId, type WalletCurrency } from '@twomc/shared';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { cdnUrl } from '@/lib/env';

/// Иконка валюты TwoMC (ADR-0098): официальный pixel-art 16×16 с CDN из
/// реестра `CURRENCY_ASSETS` — монета для баланса, рубин для рубинов. Масштаб
/// только целый (×1 = 16 px, ×2 = 32 px) и `pixelated`, без размытия.
/// Обычно декоративная рядом с подписью валюты; не загрузилась — не рисуется
/// (подпись остаётся, битой картинки нет).
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
  if (failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- pixel-art с CDN нельзя ресемплить через next/image
    <img
      src={cdnUrl(asset.path)}
      alt={decorative ? '' : asset.alt}
      aria-hidden={decorative || undefined}
      width={asset.width * scale}
      height={asset.height * scale}
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
      data-currency={asset.id}
      className={cn('shrink-0 select-none [image-rendering:pixelated]', className)}
    />
  );
}
