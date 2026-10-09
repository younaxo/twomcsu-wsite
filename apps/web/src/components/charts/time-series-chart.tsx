'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import { formatNumber } from '@/lib/format';
import { usePrefersReducedMotion } from '@/lib/use-media-query';

/// Переиспользуемый график рядов по дням (ADR-0078, Recharts v3): цвета из
/// токенов темы (корректно в Dark/Light), приглушённая сетка, solid-подсказка,
/// без анимации при prefers-reduced-motion. Данные — только реальные ряды API.

export interface ChartSeries<K extends string> {
  key: K;
  label: string;
  /// CSS-цвет, например `rgb(var(--primary))`.
  color: string;
}

export type ChartPoint<K extends string> = { day: string } & Record<K, number>;

const dayFormatter = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit' });
const fullDayFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

function formatDay(day: string, full = false): string {
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? day : (full ? fullDayFormatter : dayFormatter).format(date);
}

function ChartTooltip<K extends string>({
  active,
  payload,
  label,
  series,
  format,
}: TooltipContentProps<number, string> & {
  series: ChartSeries<K>[];
  format: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-surface-overlay px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium">{formatDay(String(label), true)}</p>
      {series.map((item) => {
        const entry = payload.find((p) => p.dataKey === item.key);
        return (
          <p key={item.key} className="flex items-center gap-2 text-muted-foreground">
            <span aria-hidden className="size-2 rounded-full" style={{ background: item.color }} />
            {item.label}:
            <span className="font-semibold tabular-nums text-foreground">
              {format(Number(entry?.value ?? 0))}
            </span>
          </p>
        );
      })}
    </div>
  );
}

export function TimeSeriesChart<K extends string>({
  data,
  series,
  height = 220,
  format = formatNumber,
  ariaLabel,
}: {
  data: ChartPoint<K>[];
  series: ChartSeries<K>[];
  height?: number;
  format?: (value: number) => string;
  ariaLabel: string;
}) {
  const reduced = usePrefersReducedMotion();
  const totals = series
    .map(
      (item) => `${item.label}: ${format(data.reduce((sum, point) => sum + point[item.key], 0))}`,
    )
    .join(', ');
  if (data.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Данных за период нет.</p>;
  }
  return (
    <figure className="m-0" data-testid="time-series-chart">
      <figcaption className="sr-only">
        {ariaLabel}. За период — {totals}.
      </figcaption>
      <div style={{ height }} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <defs>
              {series.map((item) => (
                <linearGradient key={item.key} id={`fill-${item.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={item.color} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={item.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid vertical={false} stroke="rgb(var(--border-subtle))" />
            <XAxis
              dataKey="day"
              tickFormatter={(value: string) => formatDay(value)}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
              tick={{ fill: 'rgb(var(--subtle-foreground))', fontSize: 11 }}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              width={48}
              tickFormatter={(value: number) => format(value)}
              tick={{ fill: 'rgb(var(--subtle-foreground))', fontSize: 11 }}
            />
            <Tooltip
              cursor={{ stroke: 'rgb(var(--border-strong))' }}
              content={(props) => (
                <ChartTooltip
                  {...(props as TooltipContentProps<number, string>)}
                  series={series}
                  format={format}
                />
              )}
            />
            {series.map((item) => (
              <Area
                key={item.key}
                type="monotone"
                dataKey={item.key}
                name={item.label}
                stroke={item.color}
                strokeWidth={2}
                fill={`url(#fill-${item.key})`}
                isAnimationActive={!reduced}
                dot={false}
                activeDot={{ r: 3 }}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
