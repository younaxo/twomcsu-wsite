/// Сезонные украшения оболочки — единый конфиг: какой декор, откуда ассет,
/// его размеры и период показа. Компонент `SeasonalHeaderDecoration` ничего
/// не знает о конкретном празднике, поэтому декор легко заменить, отключить
/// или добавить новый (Новый год и т.д.).
///
/// Управление через env:
///   NEXT_PUBLIC_SEASONAL_DECORATION=off        — выключить полностью;
///   NEXT_PUBLIC_SEASONAL_DECORATION=halloween  — включить вне периода;
///   NEXT_PUBLIC_SEASONAL_HALLOWEEN_SRC=<url>   — свой хостинг ассета
///                                                (рекомендуется cdn-files.twomc.su).

export interface SeasonalDecoration {
  id: string;
  /// URL ассета (внешний допустим: при недоступности декор просто не виден).
  src: string;
  /// Натуральные размеры — для пропорций полосы без layout shift.
  width: number;
  height: number;
  /// Период показа: месяц 1–12, день 1–31, включительно.
  from: { month: number; day: number };
  to: { month: number; day: number };
}

export const SEASONAL_DECORATIONS: SeasonalDecoration[] = [
  {
    id: 'halloween',
    // Ассет предоставлен владельцем (reference). Для production лучше
    // перенести на cdn-files.twomc.su — см. RISKS (внешний хостинг).
    src:
      process.env.NEXT_PUBLIC_SEASONAL_HALLOWEEN_SRC || 'https://yooma.su/assets/img/h_header.webp',
    width: 2728,
    height: 146,
    from: { month: 10, day: 1 },
    to: { month: 11, day: 7 },
  },
];

function inPeriod(decoration: SeasonalDecoration, date: Date): boolean {
  const value = (date.getMonth() + 1) * 100 + date.getDate();
  const from = decoration.from.month * 100 + decoration.from.day;
  const to = decoration.to.month * 100 + decoration.to.day;
  return from <= to ? value >= from && value <= to : value >= from || value <= to;
}

/// Активный декор на дату: env-override → период. `null` — без декора.
export function resolveSeasonalDecoration(
  date: Date,
  override: string | undefined = process.env.NEXT_PUBLIC_SEASONAL_DECORATION,
): SeasonalDecoration | null {
  const value = override?.trim().toLowerCase();
  if (value === 'off' || value === 'none') {
    return null;
  }
  if (value) {
    return SEASONAL_DECORATIONS.find((item) => item.id === value) ?? null;
  }
  return SEASONAL_DECORATIONS.find((item) => inPeriod(item, date)) ?? null;
}
