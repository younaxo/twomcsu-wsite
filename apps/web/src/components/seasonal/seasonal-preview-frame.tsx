'use client';

import { useCallback, useState } from 'react';
import { EffectsCanvas } from '@/components/seasonal/seasonal-effects';
import { BrandWordmark } from '@/components/shell/brand-wordmark';
import {
  SeasonalHeaderDecoration,
  type DecorationStatus,
} from '@/components/shell/seasonal-header-decoration';
import { cn } from '@/lib/cn';
import { SEASONAL_EFFECTS, type SeasonalEffect, type SeasonalView } from '@/lib/site/seasonal';
import { usePrefersReducedMotion } from '@/lib/use-media-query';

/// Мини-сайт для превью сезона (ADR-0090) — один и тот же в админке
/// «Внешний вид → Сезоны» и в design-lab: шапка с украшением и «o» из
/// `resolveSeasonalView`, падающий эффект и честные подписи состояния
/// (ассет не загрузился, эффект выключен, reduced motion).

const DECORATION_STATUS: Record<DecorationStatus, string> = {
  none: 'у этой кампании нет украшения',
  loading: 'загружается…',
  loaded: 'показано',
  error: 'ассет не загрузился',
};

const effectLabel = (id: SeasonalEffect) =>
  SEASONAL_EFFECTS.find((item) => item.id === id)?.label ?? id;

export function SeasonalPreviewFrame({
  view,
  device = 'desktop',
  theme,
  className,
}: {
  view: SeasonalView;
  device?: 'desktop' | 'mobile';
  /// Тема рамки; без неё — тема страницы.
  theme?: 'dark' | 'light';
  className?: string;
}) {
  const [decoration, setDecoration] = useState<{
    status: DecorationStatus;
    src: string | null;
  }>({ status: 'none', src: null });
  const onDecoration = useCallback(
    (status: DecorationStatus, src: string | null) => setDecoration({ status, src }),
    [],
  );
  const reduced = usePrefersReducedMotion();
  const wordmarkO =
    view.showWordmarkO && view.campaign?.wordmarkO
      ? { id: view.campaign.id, src: view.campaign.wordmarkO }
      : null;
  const effects = view.effects;

  return (
    <div className={cn('flex min-w-0 flex-col gap-3', className)}>
      <div
        data-theme={theme}
        data-device={device}
        data-testid="seasonal-preview-frame"
        aria-hidden
        className={cn(
          'relative mx-auto overflow-hidden rounded-lg bg-background text-foreground shadow-sm',
          device === 'desktop' ? 'aspect-[16/10] w-full' : 'h-80 w-44',
        )}
      >
        <div className="relative m-2 flex h-9 items-center rounded-md bg-surface px-2.5 shadow-sm">
          <SeasonalHeaderDecoration
            campaign={view.showDecoration ? view.campaign : null}
            preview
            onStatus={onDecoration}
            className="h-3 rounded-t-md md:h-3"
          />
          <span className="relative z-[1]">
            <BrandWordmark size="sm" seasonalO={wordmarkO} />
          </span>
        </div>
        <div className="mx-2 flex flex-col gap-1.5">
          <div className="h-14 rounded-md bg-surface" />
          <div className="h-2 w-3/4 rounded-full bg-surface-raised" />
          <div className="h-2 w-1/2 rounded-full bg-surface-raised" />
        </div>
        <EffectsCanvas
          contained
          effects={effects}
          intensity={view.effectIntensity}
          speed={view.effectSpeed}
        />
      </div>
      <p className="text-xs text-muted-foreground" data-testid="seasonal-preview-decoration">
        {!view.campaign
          ? 'Оформление сезона: нет.'
          : !view.showDecoration
            ? 'Украшение шапки: выключено.'
            : `Украшение шапки: ${DECORATION_STATUS[decoration.status]}.`}
        {view.showDecoration && decoration.status === 'error' && decoration.src ? (
          <span className="block break-all text-destructive">Адрес: {decoration.src}</span>
        ) : null}
      </p>
      <p className="text-xs text-muted-foreground" data-testid="seasonal-preview-effects">
        {effects.length === 0
          ? 'Падающий эффект: нет.'
          : `Падающий эффект: ${effects.map(effectLabel).join(', ')}.`}
        {reduced && effects.length > 0
          ? ' В системе включено «уменьшение движения» — анимация здесь не показывается.'
          : ''}
      </p>
    </div>
  );
}
