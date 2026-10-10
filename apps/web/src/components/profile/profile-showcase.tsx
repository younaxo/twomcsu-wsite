'use client';

import type {
  MediaBadgeKind,
  ProfileShowcaseAchievement,
  ProfileShowcaseAward,
  ProfileShowcaseDto,
  UserBadgeKind,
} from '@twomc/shared';
import { Trophy } from 'lucide-react';
import { useState } from 'react';
import { ProfileBadges, type ProfileDecorationView } from '@/components/profile/profile-badges';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';

/// «Награды и значки» (ADR-0100) — витрина в блоке «Игрок»: значки
/// (системные, медиа, украшение), награды и выставленные игроком
/// достижения. Только реальные данные с сервера: нет ничего — честный пустой
/// блок, без заглушек. Плитки с подсказкой (название, описание, редкость);
/// позже из них можно сделать переход к полному списку.

const RARITY_LABEL: Record<string, string> = {
  common: 'Обычная',
  rare: 'Редкая',
  epic: 'Эпическая',
  legendary: 'Легендарная',
  mythic: 'Мифическая',
};

const RARITY_RING: Record<string, string> = {
  common: 'ring-border-strong',
  rare: 'ring-sky-500/60',
  epic: 'ring-violet-500/60',
  legendary: 'ring-amber-500/70',
  mythic: 'ring-rose-500/70',
};

function rarityKey(rarity: string | null | undefined): string {
  return (rarity ?? 'common').toLowerCase();
}

function Tile({
  name,
  description,
  iconUrl,
  rarity,
  meta,
  kind,
}: {
  name: string;
  description: string | null;
  iconUrl: string;
  rarity: string | null;
  meta: string;
  kind: 'award' | 'achievement';
}) {
  const [broken, setBroken] = useState(false);
  const key = rarityKey(rarity);
  return (
    <Tooltip
      content={
        <span className="flex max-w-60 flex-col gap-0.5">
          <span className="font-medium">{name}</span>
          {description ? <span className="text-muted-foreground">{description}</span> : null}
          <span className="text-subtle-foreground">
            {[RARITY_LABEL[key], meta].filter(Boolean).join(' · ')}
          </span>
        </span>
      }
    >
      <li
        tabIndex={0}
        className="flex min-w-0 flex-col items-center gap-1.5 rounded-lg p-1.5 text-center outline-none focus-visible:bg-surface-sunken"
        data-testid={`showcase-${kind}`}
        data-rarity={key}
      >
        <span
          className={cn(
            'flex size-12 items-center justify-center overflow-hidden rounded-lg bg-surface-sunken ring-1',
            RARITY_RING[key] ?? RARITY_RING.common,
          )}
        >
          {broken ? (
            <Trophy aria-hidden className="size-5 text-subtle-foreground" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- иконки наград с CDN/хранилища
            <img
              src={iconUrl}
              alt=""
              width={40}
              height={40}
              loading="lazy"
              decoding="async"
              onError={() => setBroken(true)}
              className="size-10 object-contain"
            />
          )}
        </span>
        <span className="line-clamp-2 w-full text-[11px] leading-tight text-muted-foreground">
          {name}
        </span>
      </li>
    </Tooltip>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-medium text-subtle-foreground">{title}</h3>
      {children}
    </div>
  );
}

export function ProfileShowcase({
  showcase,
  loading = false,
  badges = [],
  mediaBadges = [],
  decoration = null,
}: {
  showcase: ProfileShowcaseDto | undefined;
  loading?: boolean;
  badges?: UserBadgeKind[];
  mediaBadges?: MediaBadgeKind[];
  decoration?: ProfileDecorationView | null;
}) {
  const awards: ProfileShowcaseAward[] = showcase?.awards ?? [];
  const achievements: ProfileShowcaseAchievement[] = showcase?.achievements ?? [];
  const hasBadges = badges.length > 0 || mediaBadges.length > 0 || Boolean(decoration);
  const empty = !loading && !hasBadges && awards.length === 0 && achievements.length === 0;
  const total = awards.length + achievements.length;

  return (
    <section
      className="flex flex-col gap-4"
      aria-labelledby="profile-showcase-title"
      data-testid="profile-showcase"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="profile-showcase-title" className="text-sm font-semibold">
          Награды и значки
        </h2>
        {total > 0 ? (
          <span className="text-xs tabular-nums text-subtle-foreground">{total}</span>
        ) : null}
      </div>
      {loading ? (
        <div className="grid grid-cols-4 gap-2" aria-busy>
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="aspect-square w-full rounded-lg" />
          ))}
        </div>
      ) : empty ? (
        <div
          className="flex flex-col items-center gap-2 rounded-lg bg-surface-sunken px-4 py-6 text-center"
          data-testid="profile-showcase-empty"
        >
          <Trophy aria-hidden className="size-6 text-subtle-foreground" />
          <p className="text-sm font-medium">Пока нет наград и значков</p>
          <p className="text-xs text-muted-foreground">
            Они появятся здесь, когда игрок их получит.
          </p>
        </div>
      ) : (
        <>
          {hasBadges ? (
            <Group title="Значки">
              <ProfileBadges badges={badges} mediaBadges={mediaBadges} decoration={decoration} />
            </Group>
          ) : null}
          {awards.length > 0 ? (
            <Group title="Награды">
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-1">
                {awards.map((award) => (
                  <Tile
                    key={award.slug}
                    kind="award"
                    name={award.name}
                    description={award.description}
                    iconUrl={award.iconUrl}
                    rarity={award.rarity}
                    meta={`Получена ${formatDate(award.grantedAt)}`}
                  />
                ))}
              </ul>
            </Group>
          ) : null}
          {achievements.length > 0 ? (
            <Group title="Достижения">
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-1">
                {achievements.map((achievement) => (
                  <Tile
                    key={achievement.slug}
                    kind="achievement"
                    name={achievement.name}
                    description={achievement.description}
                    iconUrl={achievement.iconUrl}
                    rarity={achievement.rarity}
                    meta={
                      achievement.completedAt
                        ? `Получено ${formatDate(achievement.completedAt)}`
                        : 'Получено'
                    }
                  />
                ))}
              </ul>
            </Group>
          ) : null}
        </>
      )}
    </section>
  );
}
