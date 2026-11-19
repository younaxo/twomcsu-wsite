import Image from 'next/image';
import { cn } from '@/lib/cn';
import { prizeImageSrc } from './prize-images';
import { prizesConfig, type Prize, type PrizesConfig } from './prizes';

const nf = new Intl.NumberFormat('ru-RU');

function PrizeCard({
  prize,
  col,
  row,
  rel,
  showValue,
}: {
  prize: Prize;
  col: number;
  row: number;
  rel: number | null;
  showValue: boolean;
}) {
  const src = prizeImageSrc(prize.image);
  const first = prize.place === 1;
  return (
    <li
      data-testid={`prize-${prize.place}`}
      data-place={prize.place}
      style={
        {
          '--col': col,
          '--row': row,
          '--h': rel === null ? 'auto' : `${((rel / 100) * 17).toFixed(2)}rem`,
        } as React.CSSProperties
      }
      className={cn(
        'flex min-w-0 flex-col items-center gap-2 rounded-lg border bg-surface p-4 text-center',
        'md:[grid-column-start:var(--col)] md:[grid-row-start:var(--row)] md:[min-height:var(--h)]',
        rel !== null && 'md:self-end',
        first ? 'border-primary' : 'border-border',
        'motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:-translate-y-1',
      )}
    >
      <span
        className={cn(
          'inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-sm font-bold',
          first ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
        )}
      >
        <span className="sr-only">Место </span>
        {prize.place}
        <span className="sr-only"> место</span>
      </span>
      {src ? (
        <Image
          src={src}
          alt={prize.title}
          width={160}
          height={160}
          unoptimized
          className="size-24 rounded-lg sm:size-28"
        />
      ) : null}
      <h3 className="text-balance text-base font-semibold text-foreground">{prize.title}</h3>
      <p className="text-sm text-muted-foreground">{prize.description}</p>
      {showValue && prize.showValue ? (
        <p className="text-xs text-muted-foreground" data-testid={`prize-value-${prize.place}`}>
          {nf.format(prize.value)}
        </p>
      ) : null}
    </li>
  );
}

/// Блок призов. Один список в порядке чтения 1..N (телефон: 1 колонка, узкий экран:
/// 2 колонки); на md+ места 1-5 расставляются как пьедестал по конфигу, 6-10 - рядом.
export function PrizeShowcase({ config = prizesConfig }: { config?: PrizesConfig }) {
  const sorted = [...config.prizes].sort((a, b) => a.place - b.place);
  const cell = (place: number) => {
    const pi = config.podium.order.indexOf(place);
    if (pi >= 0) {
      return { col: pi + 1, row: 1, rel: config.podium.heights[String(place)] ?? 0 };
    }
    return { col: config.rest.order.indexOf(place) + 1, row: 2, rel: null };
  };
  return (
    <section
      aria-labelledby="gw-prizes"
      data-testid="prize-showcase"
      className="flex flex-col gap-4"
    >
      <div className="text-center">
        <h2 id="gw-prizes" className="text-2xl font-semibold text-foreground">
          {config.texts.heading}
        </h2>
        <p className="mt-1 text-muted-foreground">{config.texts.intro}</p>
      </div>
      <ol
        data-testid="prize-list"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-5 md:gap-4"
      >
        {sorted.map((p) => {
          const c = cell(p.place);
          return (
            <PrizeCard
              key={p.place}
              prize={p}
              col={c.col}
              row={c.row}
              rel={c.rel}
              showValue={config.showValue}
            />
          );
        })}
      </ol>
    </section>
  );
}
