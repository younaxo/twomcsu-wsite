'use client';

import Image from 'next/image';
import { useServersOverview } from '@/lib/site/hooks';
import { SITE_LOGO_URL } from '@/lib/site/config';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';

/// Узор из «блоков» — векторный (чёткий на любом экране), детерминированный,
/// в цветах темы. Без растровых stock-картинок: только визуал проекта.
const BLOCKS: Array<[number, number, number]> = [
  [0, 0, 0.55],
  [1, 0, 0.25],
  [3, 0, 0.4],
  [6, 0, 0.18],
  [7, 0, 0.5],
  [0, 1, 0.3],
  [2, 1, 0.6],
  [5, 1, 0.22],
  [7, 1, 0.3],
  [1, 2, 0.45],
  [4, 2, 0.15],
  [6, 2, 0.42],
  [0, 3, 0.2],
  [3, 3, 0.3],
  [7, 3, 0.62],
  [0, 4, 0.5],
  [2, 4, 0.18],
  [5, 4, 0.36],
  [1, 5, 0.32],
  [6, 5, 0.2],
  [7, 5, 0.45],
  [0, 6, 0.4],
  [3, 6, 0.22],
  [4, 6, 0.5],
  [7, 6, 0.28],
  [1, 7, 0.2],
  [2, 7, 0.48],
  [5, 7, 0.3],
  [6, 7, 0.55],
];

function BlockPattern({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 8 8"
      preserveAspectRatio="xMidYMid slice"
      className={cn('absolute inset-0 size-full', className)}
    >
      {BLOCKS.map(([x, y, alpha]) => (
        <rect
          key={`${x}-${y}`}
          x={x + 0.06}
          y={y + 0.06}
          width={0.88}
          height={0.88}
          rx={0.08}
          className="fill-primary"
          fillOpacity={alpha * 0.32}
        />
      ))}
    </svg>
  );
}

/// Правая часть auth-панели: основной логотип twomc.su (постоянный, ADR-0065),
/// подпись проекта и живой онлайн серверов (реальный Server List Ping; если
/// данных нет — строка просто не показывается). `compact` — баннер для mobile.
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
  return (
    <aside
      aria-label="twomc.su"
      className={cn(
        'relative isolate overflow-hidden bg-surface-sunken',
        compact ? 'flex items-center gap-4 px-5 py-4' : 'flex flex-col justify-between p-10',
        className,
      )}
    >
      <BlockPattern />
      {/* Плотная подложка под текстом — без прозрачного стекла. */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 -z-0 h-1/2 bg-gradient-to-t from-surface-sunken to-transparent"
      />
      <div
        className={cn(
          'relative flex',
          compact ? 'items-center' : 'flex-1 items-center justify-center',
        )}
      >
        <Image
          src={SITE_LOGO_URL}
          alt=""
          width={compact ? 56 : 232}
          height={compact ? 56 : 232}
          quality={90}
          priority
          draggable={false}
          sizes={compact ? '56px' : '232px'}
          data-logo="main"
          className={cn(
            'select-none shadow-lg',
            compact ? 'size-14 rounded-xl' : 'size-[min(232px,22vw)] rounded-[28px]',
          )}
        />
      </div>
      <div className="relative flex flex-col gap-1.5">
        <p
          className={cn(
            'font-display font-bold tracking-tight',
            compact ? 'text-base' : 'text-2xl',
          )}
        >
          Один аккаунт — сайт, магазин и серверы
        </p>
        {!compact ? (
          <p className="max-w-sm text-sm text-muted-foreground">
            Профиль, покупки, достижения и друзья twomc.su — в одном месте.
          </p>
        ) : null}
        {typeof players === 'number' && typeof online === 'number' && online > 0 ? (
          <p
            className="mt-1 inline-flex items-center gap-2 text-sm text-muted-foreground"
            data-testid="auth-visual-online"
          >
            <span aria-hidden className="size-2 rounded-full bg-success" />
            {formatNumber(players)} онлайн на серверах
          </p>
        ) : null}
      </div>
    </aside>
  );
}
