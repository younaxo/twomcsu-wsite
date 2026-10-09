'use client';

import { useEffect, useState } from 'react';
import { usePublicSiteSettings } from './hooks';
import {
  resolveSeasonalFromSettings,
  type SeasonalCampaign,
  type SeasonalEffect,
} from './seasonal';

export interface SeasonalState {
  campaign: SeasonalCampaign | null;
  showWordmarkO: boolean;
  showDecoration: boolean;
  showEffects: boolean;
  showBanners: boolean;
  /// Эффекты к показу: пусто, если эффекты выключены или их нет у кампании.
  effects: SeasonalEffect[];
  effectIntensity: number;
}

const NONE: SeasonalState = {
  campaign: null,
  showWordmarkO: false,
  showDecoration: false,
  showEffects: false,
  showBanners: false,
  effects: [],
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
    const showEffects = !!campaign && (seasonal?.showEffects ?? true);
    setState({
      campaign,
      showWordmarkO: !!campaign && (seasonal?.showWordmarkO ?? true),
      showDecoration: !!campaign && (seasonal?.showDecoration ?? true),
      showEffects,
      showBanners: !!campaign && (seasonal?.showBanners ?? true),
      effects: showEffects && campaign ? campaign.effects : [],
      effectIntensity: seasonal?.effectIntensity ?? 2,
    });
  }, [settings.isPending, seasonal]);
  return state;
}
