'use client';

import { Clapperboard, Dices, Sparkles, Swords, type LucideIcon } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/cn';
import { HOME_FEATURES, type HomeFeature } from '@/lib/site/config';
import { HomeSection } from './section';

const ICONS: Record<string, LucideIcon> = {
  casino: Dices,
  events: Clapperboard,
  duels: Swords,
  items: Sparkles,
};

function FeatureCard({ feature }: { feature: HomeFeature }) {
  const Icon = ICONS[feature.id] ?? Sparkles;
  const large = feature.size === 'large';
  return (
    <article
      data-testid={`feature-${feature.id}`}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border bg-surface shadow edge-highlight',
        large && 'md:col-span-2 md:row-span-3',
      )}
    >
      <div
        className={cn(
          'relative w-full overflow-hidden bg-surface-sunken',
          large ? 'aspect-[16/9] md:min-h-[320px] md:flex-1' : 'aspect-[16/7]',
        )}
      >
        {feature.image ? (
          <Image
            src={feature.image}
            alt={feature.title}
            fill
            sizes={large ? '(min-width: 768px) 60vw, 100vw' : '(min-width: 768px) 30vw, 100vw'}
            className="object-cover transition-transform duration-slow group-hover:scale-[1.02] motion-reduce:transition-none"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Icon
              aria-hidden
              className={cn('text-primary', large ? 'size-20' : 'size-10')}
              strokeWidth={1.5}
            />
          </div>
        )}
      </div>
      <div className={cn('flex flex-col gap-1 p-5', large && 'md:p-6')}>
        <h3 className={cn('font-display font-semibold', large ? 'text-2xl' : 'text-lg')}>
          {feature.title}
        </h3>
        <p className="text-sm text-muted-foreground">{feature.description}</p>
      </div>
    </article>
  );
}

/// Showcase реальных сильных сторон проекта: 1 крупная карточка + 3
/// дополнительных. Превью — только реальные изображения владельца; без них
/// карточка с иконкой, не чужой скриншот.
export function HomeShowcase() {
  const large = HOME_FEATURES.find((feature) => feature.size === 'large');
  const small = HOME_FEATURES.filter((feature) => feature.size !== 'large').slice(0, 3);
  return (
    <HomeSection
      id="showcase"
      eyebrow="Почему twomc.su"
      title="Механики, которых нет в ванильном Minecraft"
      description="Собственные игровые системы, события с режиссурой и предметы, созданные для этого проекта."
    >
      <div className="grid gap-4 md:grid-cols-3 md:grid-rows-3">
        {large ? <FeatureCard feature={large} /> : null}
        {small.map((feature) => (
          <FeatureCard key={feature.id} feature={feature} />
        ))}
      </div>
    </HomeSection>
  );
}
