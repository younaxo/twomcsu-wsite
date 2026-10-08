'use client';

import type { ComponentType } from 'react';
import type { DirectionId } from '../directions';
import { Showcase as DaylightShowcase } from './daylight/showcase';
import { Showcase as SignalShowcase } from './signal/showcase';

export interface ShowcaseProps {
  /// Активная тема (для направлений с переключателем).
  theme: 'light' | 'dark';
}

function Pending({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed p-card-p text-sm text-muted-foreground">
      {label} — в работе.
    </div>
  );
}

const EmberShowcase: ComponentType<ShowcaseProps> = () => <Pending label="Витрина «Раскалённое»" />;

/// Реестр витрин направлений. Каждая витрина — композиция одного и того же
/// набора элементов (navbar, hero, sidebar, card, table, profile, server
/// status, notification…) в своём визуальном языке.
export const SHOWCASES: Record<DirectionId, ComponentType<ShowcaseProps>> = {
  ember: EmberShowcase,
  daylight: DaylightShowcase,
  signal: SignalShowcase,
};

export { ComponentLab } from '../sections/component-lab';
