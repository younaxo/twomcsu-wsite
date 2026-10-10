'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import type { SeasonalCampaign } from '@/lib/site/seasonal';
import { useSeasonal } from '@/lib/site/use-seasonal';

/// Сезонное украшение верхней кромки шапки — из активной кампании реестра
/// `lib/site/seasonal.ts` (сейчас ассет есть у Halloween).
///
/// - Свой флаг «Украшение шапки» (ADR-0090): не зависит от падающего эффекта,
///   буквы «o» и баннеров; нужна только активная кампания с ассетом.
/// - Абсолютно позиционировано внутри header-поверхности: не занимает места,
///   нет layout shift; `pointer-events-none` — не перекрывает кликабельное.
/// - Чисто декоративное: `aria-hidden`.
/// - Ассет проверяется загрузкой заранее (`status`): пока грузится — полоса без
///   картинки, ошибка — на сайте полосы нет (и предупреждение в dev-консоли), в
///   превью админки — явное состояние «ассет не загрузился» с адресом, а не
///   молчаливая пустота. Повторяется по горизонтали, высота фиксирована.
/// - Монохромный ассет (`tint`) рисуется маской цвета темы — тёмные силуэты
///   Хэллоуина иначе сливались с тёмной шапкой (так и выглядел баг «включено,
///   но не видно»).
/// - Один компонент для сайта и превью: превью передаёт `campaign` явно.
/// - Без glass: никакого backdrop-filter, только изображение.

export type DecorationStatus = 'none' | 'loading' | 'loaded' | 'error';

const warned = new Set<string>();

function useAssetStatus(src: string | null): DecorationStatus {
  const [status, setStatus] = useState<DecorationStatus>(src ? 'loading' : 'none');
  useEffect(() => {
    if (!src) {
      setStatus('none');
      return;
    }
    setStatus('loading');
    let alive = true;
    const image = new Image();
    image.onload = () => alive && setStatus('loaded');
    image.onerror = () => {
      if (!alive) return;
      setStatus('error');
      if (process.env.NODE_ENV !== 'production' && !warned.has(src)) {
        warned.add(src);
        console.warn(`Украшение шапки: ассет не загрузился — ${src}`);
      }
    };
    image.src = src;
    return () => {
      alive = false;
    };
  }, [src]);
  return status;
}

export function SeasonalHeaderDecoration({
  className,
  campaign,
  preview = false,
  onStatus,
}: {
  className?: string;
  /// Явная кампания (preview в админке); по умолчанию — активная на сайте.
  campaign?: SeasonalCampaign | null;
  /// Превью в админке: ошибку загрузки показать явно.
  preview?: boolean;
  onStatus?: (status: DecorationStatus, src: string | null) => void;
}) {
  const seasonal = useSeasonal();
  const source =
    campaign === undefined ? (seasonal.showDecoration ? seasonal.campaign : null) : campaign;
  const decoration = source?.headerDecoration
    ? { id: source.id, ...source.headerDecoration }
    : null;
  const src = decoration?.src ?? null;
  const status = useAssetStatus(src);

  useEffect(() => {
    onStatus?.(status, src);
  }, [onStatus, status, src]);

  if (!decoration) return null;
  if (status === 'error' && !preview) return null;

  return (
    <div
      aria-hidden
      data-testid="seasonal-decoration"
      data-season={decoration.id}
      data-state={status}
      className={cn(
        'pointer-events-none absolute inset-x-0 top-0 z-0 overflow-hidden rounded-t-xl',
        'h-5 md:h-7',
        status === 'error' &&
          'flex items-center justify-center bg-destructive-soft text-[10px] font-medium text-destructive',
        className,
      )}
      data-tint={decoration.tint ? 'true' : undefined}
      style={
        status !== 'loaded'
          ? undefined
          : decoration.tint
            ? {
                // Силуэты — маска, цвет — из темы: читаются и в Dark, и в Light.
                WebkitMaskImage: `url("${decoration.src}")`,
                maskImage: `url("${decoration.src}")`,
                WebkitMaskRepeat: 'repeat-x',
                maskRepeat: 'repeat-x',
                WebkitMaskPosition: 'top center',
                maskPosition: 'top center',
                WebkitMaskSize: 'auto 100%',
                maskSize: 'auto 100%',
                backgroundColor: 'rgb(var(--foreground) / 0.55)',
              }
            : {
                backgroundImage: `url("${decoration.src}")`,
                backgroundRepeat: 'repeat-x',
                backgroundPosition: 'top center',
                backgroundSize: 'auto 100%',
              }
      }
    >
      {status === 'error' ? 'Ассет украшения не загрузился' : null}
    </div>
  );
}
