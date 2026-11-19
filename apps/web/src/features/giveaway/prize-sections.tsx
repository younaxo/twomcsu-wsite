import Image from 'next/image';
import { cn } from '@/lib/cn';
import { prizeImageSrc } from './prize-images';
import { prizesConfig, type Prize, type PrizesConfig } from './prizes';
import { Reveal } from './reveal';

const nf = new Intl.NumberFormat('ru-RU');

function PrizeBody({ prize, showValue, big }: { prize: Prize; showValue: boolean; big: boolean }) {
  const src = prizeImageSrc(prize.image);
  return (
    <Reveal className="flex w-full flex-col items-center gap-3 text-center">
      <span
        aria-hidden="true"
        className={cn(
          'font-black leading-none tabular-nums text-primary',
          big ? 'text-8xl sm:text-9xl' : 'text-5xl sm:text-6xl',
        )}
      >
        {prize.place}
      </span>
      {src ? (
        <div
          className={cn(
            'w-full bg-[radial-gradient(closest-side,rgb(var(--primary)/0.16),transparent)]',
            big ? 'max-w-sm sm:max-w-md' : 'max-w-[15rem] sm:max-w-xs',
          )}
        >
          <Image
            src={src}
            alt={prize.title}
            width={400}
            height={300}
            unoptimized
            className="h-auto w-full"
          />
        </div>
      ) : null}
      <h3
        className={cn(
          'text-balance font-semibold text-foreground',
          big ? 'text-2xl sm:text-3xl' : 'text-lg sm:text-xl',
        )}
      >
        <span className="sr-only">{prize.place} место: </span>
        {prize.title}
      </h3>
      <p className={cn('max-w-prose text-muted-foreground', big ? 'text-base' : 'text-sm')}>
        {prize.description}
      </p>
      {showValue && prize.showValue ? (
        <p className="text-xs text-muted-foreground" data-testid={`prize-value-${prize.place}`}>
          {nf.format(prize.value)}
        </p>
      ) : null}
    </Reveal>
  );
}

/// Призы без карточек и рамок. Места из `podium.order` (1-5) - отдельные крупные
/// разделы по центру одно под другим; из `rest.order` (6-10) - по два в ряд (на
/// телефоне одна колонка). Порядок в DOM и на экране везде 1..N.
export function PrizeSections({ config = prizesConfig }: { config?: PrizesConfig }) {
  const byPlace = new Map(config.prizes.map((p) => [p.place, p]));
  const pick = (places: number[]) =>
    [...places]
      .sort((a, b) => a - b)
      .map((n) => byPlace.get(n))
      .filter((p): p is Prize => p !== undefined);
  const top = pick(config.podium.order);
  const rest = pick(config.rest.order);
  return (
    <section
      aria-labelledby="gw-prizes"
      data-testid="prize-sections"
      className="mx-auto flex w-full max-w-4xl flex-col items-center gap-10"
    >
      <div className="text-center">
        <h2 id="gw-prizes" className="text-3xl font-bold text-foreground sm:text-4xl">
          {config.texts.heading}
        </h2>
        <p className="mt-2 text-muted-foreground">{config.texts.intro}</p>
      </div>
      <ol data-testid="prize-list-top" className="flex w-full flex-col">
        {top.map((p) => (
          <li
            key={p.place}
            data-testid={`prize-${p.place}`}
            data-place={p.place}
            className="flex flex-col items-center border-t border-border py-14 first:border-t-0 first:pt-4 sm:py-20"
          >
            <PrizeBody prize={p} showValue={config.showValue} big />
          </li>
        ))}
      </ol>
      <ol
        data-testid="prize-list-rest"
        start={rest[0]?.place}
        className="grid w-full grid-cols-1 gap-x-8 gap-y-16 border-t border-border pt-14 sm:grid-cols-2"
      >
        {rest.map((p) => (
          <li
            key={p.place}
            data-testid={`prize-${p.place}`}
            data-place={p.place}
            className="flex flex-col items-center sm:[&:last-child:nth-child(odd)]:col-span-2"
          >
            <PrizeBody prize={p} showValue={config.showValue} big={false} />
          </li>
        ))}
      </ol>
    </section>
  );
}
