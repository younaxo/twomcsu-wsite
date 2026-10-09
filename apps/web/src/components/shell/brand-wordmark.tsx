'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';
import { SITE_NAME } from '@/lib/site/config';
import { useSeasonal } from '@/lib/site/use-seasonal';

/// Визуальный wordmark «twomc.su» с фирменной буквой «o».
///
/// Буква выбирается централизованно здесь — Header/Footer/Admin/Auth ничего
/// не знают о сезонах:
///   сезонная система выключена / нет активной кампании / у кампании нет
///   своей «o» / её файл не загрузился → базовая «o» (контур Onest Bold
///   в фирменном оранжевом);
///   активная кампания со своей «o» → её SVG (`public/assets/brand/wordmark-o-<id>.svg`).
///
/// Только для брендовых lockup'ов. Title, metadata, aria-label, e-mail, URL —
/// всегда строка `twomc.su` (SITE_NAME); screen reader читает её целиком:
/// видимая часть aria-hidden, рядом sr-only текст.

/// Базовая «o»: глиф Onest Bold (шрифт сайта, 1000 ед./em): bbox x 35…564,
/// y −536…7, advance ≈ 599 — стоит на базовой линии как обычная буква.
const DEFAULT_O_PATH =
  'M301,7C247.667,7 201,-3.833 161,-25.5 121,-47.167 90,-78.167 68,-118.5 46,-158.833 35,-206.667 35,-262 35,-318.667 46.167,-367.5 68.5,-408.5 90.833,-449.5 122,-481 162,-503 202,-525 248,-536 300,-536 353.333,-536 399.667,-524.667 439,-502 478.333,-479.333 509,-447.667 531,-407 553,-366.333 564,-317.667 564,-261 564,-205.667 553.167,-157.833 531.5,-117.5 509.833,-77.167 479.5,-46.333 440.5,-25 401.5,-3.667 355,7 301,7z M299,-121C329.667,-121 354.333,-127.667 373,-141 391.667,-154.333 405.167,-171.833 413.5,-193.5 421.833,-215.167 426,-238 426,-262 426,-286 421.833,-309 413.5,-331 405.167,-353 391.833,-371.167 373.5,-385.5 355.167,-399.833 330.333,-407 299,-407 269,-407 244.667,-399.833 226,-385.5 207.333,-371.167 193.833,-353 185.5,-331 177.167,-309 173,-286 173,-262 173,-237.333 177.167,-214.333 185.5,-193 193.833,-171.667 207.333,-154.333 226,-141 244.667,-127.667 269,-121 299,-121z';

/// Сезонные SVG рисуются в поле 800×1020: тело буквы занимает y 340…956
/// (как глиф Onest, базовая линия y = 947.94, начало глифа x = 60.3), сверху —
/// место под украшение (шляпа и т.п.).
///
/// Масштаб задаётся через «рост» тела буквы относительно обычной строчной
/// (x-height Onest ≈ 0.536em): сезонная «o» заметнее соседних букв, но не
/// огромная картинка. В маленьких lockup'ах — крупнее (+15%), чтобы форма
/// считывалась на 16–18px; в крупных — скромнее (+6%). Всё в em: line-height
/// и интервалы слова не меняются.
const O_BODY_UNITS = 956 - 340;
const X_HEIGHT_EM = 0.536;

function seasonalOStyle(boost: number) {
  // Сколько em занимает 1 единица SVG, чтобы тело буквы = x-height × boost.
  const em = (X_HEIGHT_EM * boost) / O_BODY_UNITS;
  return {
    width: `${(800 * em).toFixed(4)}em`,
    height: `${(1020 * em).toFixed(4)}em`,
    verticalAlign: `${(-(1020 - 947.94) * em).toFixed(4)}em`,
    marginInline: `${(-60.3 * em).toFixed(4)}em`,
    // Украшение над буквой не должно увеличивать высоту строки: отрицательный
    // верхний margin убирает его из line box (картинка стоит на базовой линии
    // по нижнему краю и визуально не сдвигается).
    marginTop: '-0.3em',
  } as const;
}

const SEASONAL_O_BOOST = { sm: 1.15, md: 1.15, lg: 1.1, xl: 1.06 } as const;

const SIZE_CLASS = {
  sm: 'text-base',
  md: 'text-lg',
  lg: 'text-2xl',
  xl: 'text-5xl md:text-7xl',
} as const;

export type BrandWordmarkSize = keyof typeof SIZE_CLASS;

function DefaultO() {
  return (
    <svg
      data-wordmark-o="default"
      viewBox="35 -536 529 543"
      aria-hidden
      focusable="false"
      className="inline-block fill-current text-primary"
      style={{
        width: '0.529em',
        height: '0.543em',
        verticalAlign: '-0.007em',
        marginInline: '0.035em',
      }}
    >
      <path fillRule="evenodd" clipRule="evenodd" d={DEFAULT_O_PATH} />
    </svg>
  );
}

/// Сезонная «o» активной кампании (или null — базовая).
/// Из серверных настроек сезонов (ADR-0079), после монтирования — без
/// расхождения SSR и клиента; флаг «Сезонная «o»» в админке.
export function useSeasonalWordmarkO(): { id: string; src: string } | null {
  const seasonal = useSeasonal();
  const campaign = seasonal.campaign;
  return seasonal.showWordmarkO && campaign?.wordmarkO
    ? { id: campaign.id, src: campaign.wordmarkO }
    : null;
}

export function BrandWordmark({
  size = 'md',
  className,
  seasonalO,
}: {
  size?: BrandWordmarkSize;
  className?: string;
  /// Явная «o» (preview в админке); по умолчанию — из активной кампании.
  seasonalO?: { id: string; src: string } | null;
}) {
  const active = useSeasonalWordmarkO();
  const o = seasonalO === undefined ? active : seasonalO;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showSeasonal = o !== null && failedSrc !== o.src;

  return (
    <span
      data-testid="brand-wordmark"
      className={cn(
        'inline-block select-none whitespace-nowrap font-display font-bold tracking-tight',
        SIZE_CLASS[size],
        className,
      )}
    >
      <span className="sr-only">{SITE_NAME}</span>
      <span aria-hidden>
        tw
        {showSeasonal ? (
          // eslint-disable-next-line @next/next/no-img-element -- SVG-глиф в em, без оптимизатора
          <img
            src={o.src}
            alt=""
            data-wordmark-o={o.id}
            draggable={false}
            decoding="async"
            onError={() => setFailedSrc(o.src)}
            className="inline-block max-w-none"
            style={seasonalOStyle(SEASONAL_O_BOOST[size])}
          />
        ) : (
          <DefaultO />
        )}
        mc.su
      </span>
    </span>
  );
}
