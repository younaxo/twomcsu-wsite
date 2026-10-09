'use client';

import { useEffect, useState } from 'react';
import { usePublicSiteSettings } from './hooks';
import { resolveSeasonalFromSettings, type SeasonalCampaign } from './seasonal';

export interface SeasonalState {
  campaign: SeasonalCampaign | null;
  showWordmarkO: boolean;
  showDecoration: boolean;
  showEffects: boolean;
  showBanners: boolean;
  effectIntensity: number;
}

const NONE: SeasonalState = {
  campaign: null,
  showWordmarkO: false,
  showDecoration: false,
  showEffects: false,
  showBanners: false,
  effectIntensity: 2,
};

/// Сезонное оформление (ADR-0079): настройки и серверное время из
/// `/site/settings`. Считается только после монтирования — SSR и гидрация всегда
/// без сезонных элементов (никаких расхождений разметки).
export function useSeasonal(): SeasonalState {
  const settings = usePublicSiteSettings();
  const seasonal = settings.data?.seasonal;
  const [state, setState] = useState<SeasonalState>(NONE);
  useEffect(() => {
    if (settings.isPending) return;
    const now = seasonal ? new Date(seasonal.serverTime) : new Date();
    const campaign = resolveSeasonalFromSettings(seasonal, now);
    setState({
      campaign,
      showWordmarkO: !!campaign && (seasonal?.showWordmarkO ?? true),
      showDecoration: !!campaign && (seasonal?.showDecoration ?? true),
      showEffects: !!campaign && (seasonal?.showEffects ?? true),
      showBanners: !!campaign && (seasonal?.showBanners ?? true),
      effectIntensity: seasonal?.effectIntensity ?? 2,
    });
  }, [settings.isPending, seasonal]);
  return state;
}
