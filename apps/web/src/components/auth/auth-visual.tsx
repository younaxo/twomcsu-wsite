'use client';

import { ShoppingBag, Swords, Trophy } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import { SITE_LOGO_URL } from '@/lib/site/config';
import { useServersOverview } from '@/lib/site/hooks';

/// Изометрический кластер блоков (векторный, чёткий на любом экране) — отсылка
/// к Minecraft без выдуманного игрового UI. Цвета — из темы.
const CUBES: Array<[number, number, number]> = [
  // [x, y, яркость] в изометрической сетке
  [0, 2, 0.5],
  [1, 2, 0.35],
  [2, 2, 0.6],
  [0, 1, 0.3],
  [1, 1, 0.75],
  [2, 1, 0.4],
  [1, 0, 0.55],
  [3, 1, 0.25],
  [3, 2, 0.45],
];

function IsoCube({ x, y, tone }: { x: number; y: number; tone: number }) {
  const w = 40;
  const cx = (x - y) * w + 200;
  const cy = (x + y) * (w / 2) + 40 - y * 10;
  const top = `${cx},${cy} ${cx + w},${cy + w / 2} ${cx},${cy + w} ${cx - w},${cy + w / 2}`;
  const left = `${cx - w},${cy + w / 2} ${cx},${cy + w} ${cx},${cy + w * 2} ${cx - w},${cy + w * 1.5}`;
  const right = `${cx + w},${cy + w / 2} ${cx},${cy + w} ${cx},${cy + w * 2} ${cx + w},${cy + w * 1.5}`;
  return (
    <g>
      <polygon points={top} className="fill-primary" fillOpacity={0.18 + tone * 0.22} />
      <polygon points={left} className="fill-primary" fillOpacity={0.08 + tone * 0.12} />
      <polygon points={right} className="fill-primary" fillOpacity={0.04 + tone * 0.08} />
    </g>
  );
}

function BlockCluster({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 400 280" className={className}>
      {CUBES.map(([x, y, tone]) => (
        <IsoCube key={`${x}-${y}`} x={x} y={y} tone={tone} />
      ))}
    </svg>
  );
}

const FEATURES = [
  { icon: ShoppingBag, label: 'Магазин и подарки друзьям' },
  { icon: Trophy, label: 'Профиль, достижения и награды' },
  { icon: Swords, label: 'Серверы twomc.su и онлайн' },
] as const;

/// Правая часть auth-панели: основной логотип twomc.su (постоянный, ADR-0065)
/// на тёплом фирменном фоне с кластером блоков, что даёт аккаунт, и живой
/// онлайн (реальный Server List Ping; нет данных — строка скрыта). Плотные
/// поверхности, без glass. `compact` — баннер для mobile.
export function AuthVisual({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const overview = useServersOverview();
  const players = overview.data?.totalPlayers;
  const online = overview.data?.onlineServers;
  const onlineLine =
    typeof players === 'number' && typeof online === 'number' && online > 0 ? (
      <p
        className="inline-flex items-center gap-2 text-sm text-muted-foreground"
        data-testid="auth-visual-online"
      >
        <span aria-hidden className="size-2 rounded-full bg-success" />
        {formatNumber(players)} онлайн на серверах
      </p>
    ) : null;

  if (compact) {
    return (
      <aside
        aria-label="twomc.su"
        className={cn(
          'relative isolate flex items-center gap-4 overflow-hidden bg-surface-sunken px-5 py-4',
          className,
        )}
      >
        <BlockCluster className="absolute -right-10 -top-6 -z-10 h-32 opacity-70" />
        <Image
          src={SITE_LOGO_URL}
          alt=""
          width={56}
          height={56}
          quality={90}
          priority
          draggable={false}
          sizes="56px"
          data-logo="main"
          className="size-14 shrink-0 select-none rounded-xl shadow-lg"
        />
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="font-display text-base font-bold leading-tight tracking-tight">
            Один аккаунт — сайт, магазин и серверы
          </p>
          {onlineLine}
        </div>
      </aside>
    );
  }

  return (
    <aside
      aria-label="twomc.su"
      className={cn(
        'relative isolate flex-col justify-between gap-8 overflow-hidden bg-surface-sunken p-10',
        className,
      )}
      style={{
        backgroundImage:
          'radial-gradient(120% 80% at 100% 0%, rgb(var(--primary) / 0.16) 0%, transparent 60%)',
      }}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-subtle-foreground">
        twomc.su · Minecraft
      </p>
      <div className="relative flex flex-1 items-center justify-center">
        <BlockCluster className="absolute inset-x-0 top-1/2 -z-10 mx-auto w-full max-w-[420px] -translate-y-1/2" />
        <Image
          src={SITE_LOGO_URL}
          alt=""
          width={176}
          height={176}
          quality={90}
          priority
          draggable={false}
          sizes="176px"
          data-logo="main"
          className="size-[min(176px,16vw)] select-none rounded-[28px] shadow-lg"
        />
      </div>
      <div className="flex flex-col gap-4">
        <p className="font-display text-2xl font-bold leading-tight tracking-tight">
          Один аккаунт — сайт, магазин и серверы
        </p>
        <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
          {FEATURES.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-2.5">
              <Icon aria-hidden className="size-4 shrink-0 text-primary" />
              {label}
            </li>
          ))}
        </ul>
        {onlineLine}
      </div>
    </aside>
  );
}
