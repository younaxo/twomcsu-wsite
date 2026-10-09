'use client';

import { cn } from '@/lib/cn';
import { useSeasonal } from '@/lib/site/use-seasonal';

/// Сезонное украшение верхней кромки шапки — из активной кампании реестра
/// `lib/site/seasonal.ts` (сейчас ассет есть у Halloween).
///
/// - Абсолютно позиционировано внутри header-поверхности: не занимает места,
///   нет layout shift; `pointer-events-none` — не перекрывает кликабельное.
/// - Чисто декоративное: `aria-hidden`, без alt-текста для скринридеров.
/// - Ассет — CSS background: если внешний файл недоступен, полоса просто
///   пустая (никакой «битой картинки»); повторяется по горизонтали, высота
///   фиксирована, пропорции из конфига.
/// - Активный декор — из серверных настроек сезонов и серверного времени
///   (`useSeasonal`, ADR-0079), после монтирования; флаг «Декор» в админке.
/// - Без glass: никакого backdrop-filter, только изображение.
export function SeasonalHeaderDecoration({ className }: { className?: string }) {
  const seasonal = useSeasonal();
  const decoration =
    seasonal.showDecoration && seasonal.campaign?.headerDecoration
      ? { id: seasonal.campaign.id, ...seasonal.campaign.headerDecoration }
      : null;

  if (!decoration) {
    return null;
  }

  return (
    <div
      aria-hidden
      data-testid="seasonal-decoration"
      data-season={decoration.id}
      className={cn(
        'pointer-events-none absolute inset-x-0 top-0 z-0 overflow-hidden rounded-t-xl',
        'h-5 md:h-7',
        className,
      )}
      style={{
        backgroundImage: `url("${decoration.src}")`,
        backgroundRepeat: 'repeat-x',
        backgroundPosition: 'top center',
        backgroundSize: 'auto 100%',
      }}
    />
  );
}
