'use client';

import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { DisplayableRole } from '@/lib/roles/primary-role';
import type { DemoUser } from '../../demo-data';

/// Общие кирпичи направления «Пульт»: строка-«приборка», live-индикатор,
/// заголовок панели и маппинг демо-ролей на slug PNG-префиксов.

/// Демо-роли → slug префикса из resource pack. У игроков и VIP префикса нет —
/// `RolePrefix` сам покажет текстовый бейдж.
const ROLE_META: Record<string, { slug: string; priority: number }> = {
  Owner: { slug: 'owner', priority: 1000 },
  'Chief Curator': { slug: 'chief-curator', priority: 900 },
  'Senior Curator': { slug: 'senior-curator', priority: 800 },
  'Старший модератор': { slug: 'senior-moderator', priority: 500 },
  Хелпер: { slug: 'helper', priority: 300 },
  VIP: { slug: 'vip', priority: 100 },
  Игрок: { slug: 'player', priority: 0 },
};

export function roleOf(user: DemoUser): DisplayableRole {
  const meta = ROLE_META[user.role] ?? { slug: 'player', priority: 0 };
  return {
    slug: meta.slug,
    priority: meta.priority,
    displayName: user.role,
    color: user.roleColor,
  };
}

/// Контролы направления — 32px; на coarse pointer цель нажатия растим до 40px.
export const coarseTarget = '[@media(pointer:coarse)]:min-h-10';

/// Единственная анимация направления: мигающая точка «live».
export function LiveDot({ label = 'Данные обновляются' }: { label?: string }) {
  return (
    <span role="img" aria-label={label} className="inline-flex size-2 shrink-0">
      <span aria-hidden className="size-full animate-pulse rounded-sm bg-success" />
    </span>
  );
}

export interface InstrumentLineProps extends HTMLAttributes<HTMLParagraphElement> {
  /// Показания по порядку: «TwoMC», «4 сервера», «209 онлайн»…
  items: ReactNode[];
}

/// Строка-«приборка»: моноширинные показания через разделитель. Это данные,
/// не декор — каждый элемент несёт значение.
export function InstrumentLine({ items, className, ...props }: InstrumentLineProps) {
  return (
    <p
      className={cn(
        'flex min-w-0 flex-wrap items-center gap-x-2 font-mono text-xs tabular text-muted-foreground',
        className,
      )}
      {...props}
    >
      {items.map((item, index) => (
        <span key={index} className="inline-flex items-center gap-x-2">
          {index > 0 ? (
            <span aria-hidden className="text-subtle-foreground">
              ·
            </span>
          ) : null}
          {item}
        </span>
      ))}
    </p>
  );
}

export interface PanelHeadingProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: ReactNode;
  /// Справа: ссылка «Все», счётчик, кнопка.
  aside?: ReactNode;
}

/// Шапка панели высотой 40px с нижней линией — часть видимой сетки.
export function PanelHeading({ title, aside, className, ...props }: PanelHeadingProps) {
  return (
    <div
      className={cn(
        'flex h-10 shrink-0 items-center justify-between gap-2 border-b px-3',
        className,
      )}
      {...props}
    >
      <h4 className="truncate text-sm font-medium">{title}</h4>
      {aside ? <div className="flex shrink-0 items-center gap-2">{aside}</div> : null}
    </div>
  );
}

/// Имитация запроса для демо-действий (бан, сохранение).
export const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
