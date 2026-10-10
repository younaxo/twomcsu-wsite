'use client';

import { useEffect, useState } from 'react';
import { usePublicSiteSettings } from './hooks';
import { resolveSeasonalView, type SeasonalView } from './seasonal';

/// Состояние сезонного оформления на сайте — см. `resolveSeasonalView`.
export type SeasonalState = SeasonalView;

const NONE: SeasonalState = {
  campaign: null,
  showWordmarkO: false,
  showDecoration: false,
  showBanners: false,
  fallingMode: 'season',
  effects: [],
  effectIntensity: 2,
  effectSpeed: 2,
};

/// Сезонное оформление (ADR-0079, ADR-0090): настройки и серверное время из
/// `/site/settings`. Считается только после монтирования — SSR и гидрация всегда
/// без сезонных элементов (никаких расхождений разметки).
export function useSeasonal(): SeasonalState {
  const settings = usePublicSiteSettings();
  const seasonal = settings.data?.seasonal;
  const [state, setState] = useState<SeasonalState>(NONE);
  useEffect(() => {
    if (settings.isPending) return;
    const now = seasonal ? new Date(seasonal.serverTime) : new Date();
    setState(resolveSeasonalView(seasonal, now));
  }, [settings.isPending, seasonal]);
  return state;
}
