'use client';

import type { CalendarEventDto } from '@twomc/shared';
import { CalendarClock, Radio } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';
import { formatDateTime, plural } from '@/lib/format';
import { splitEvents, useHomeEvents } from './home-hooks';
import { HomeSection } from './section';

/// «До начала»: дни/часы/минуты без секунд — обновляется раз в минуту.
export function formatCountdown(startsAt: string, now: Date): string {
  const diff = Date.parse(startsAt) - now.getTime();
  if (diff <= 0) return 'уже началось';
  const minutes = Math.floor(diff / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) {
    return `через ${days} ${plural(days, { one: 'день', few: 'дня', many: 'дней' })} ${hours} ч`;
  }
  if (hours > 0) {
    return `через ${hours} ч ${mins} мин`;
  }
  return `через ${mins} ${plural(mins, { one: 'минуту', few: 'минуты', many: 'минут' })}`;
}

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function EventCard({
  event,
  kind,
  now,
}: {
  event: CalendarEventDto;
  kind: 'active' | 'next' | 'upcoming';
  now: Date;
}) {
  const highlighted = kind !== 'upcoming';
  return (
    <article
      data-testid={`event-${kind}`}
      className={cn(
        'flex flex-col overflow-hidden rounded-xl border bg-surface shadow',
        highlighted && 'md:flex-row',
      )}
    >
      {event.coverImage ? (
        <div
          className={cn(
            'relative aspect-[16/7] bg-surface-sunken',
            highlighted && 'md:w-2/5 md:aspect-auto',
          )}
        >
          <Image
            src={event.coverImage}
            alt=""
            fill
            sizes="(min-width: 768px) 40vw, 100vw"
            className="object-cover"
          />
        </div>
      ) : null}
      <div className="flex flex-1 flex-col gap-2 p-5">
        <div className="flex flex-wrap items-center gap-2">
          {kind === 'active' ? (
            <Badge tone="success" icon={<Radio />}>
              Идёт сейчас
            </Badge>
          ) : kind === 'next' ? (
            <Badge tone="primary" icon={<CalendarClock />}>
              Следующее · {formatCountdown(event.startsAt, now)}
            </Badge>
          ) : (
            <Badge tone="neutral">{formatCountdown(event.startsAt, now)}</Badge>
          )}
          {event.server ? <Badge tone="neutral">{event.server}</Badge> : null}
        </div>
        <h3 className={cn('font-display font-semibold', highlighted ? 'text-xl' : 'text-base')}>
          {event.title}
        </h3>
        <p
          className={cn(
            'text-sm text-muted-foreground',
            highlighted ? 'line-clamp-3' : 'line-clamp-2',
          )}
        >
          {event.description}
        </p>
        <p className="mt-auto text-xs text-subtle-foreground tabular">
          {formatDateTime(event.startsAt)}
          {event.endsAt ? ` — ${formatDateTime(event.endsAt)}` : ''}
        </p>
      </div>
    </article>
  );
}

/// «Сейчас на twomc.su»: активный ивент, следующий (с временем до начала) и
/// ближайшие. Без данных — честный empty state, никаких fake-событий.
export function HomeEvents() {
  const events = useHomeEvents();
  const now = useNow(60_000);
  const { active, next, upcoming } = splitEvents(events.data ?? [], now);
  const rest = upcoming.filter((event) => event.id !== next?.id).slice(0, 3);

  return (
    <HomeSection
      id="events"
      eyebrow="События"
      title="Сейчас на twomc.su"
      description="Ивенты, сезоны и важные обновления по расписанию проекта."
    >
      {events.isPending ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      ) : !active && !next ? (
        <EmptyState
          icon={<CalendarClock />}
          title="Пока ничего не запланировано"
          description="Как только администрация объявит ивент или сезон, он появится здесь и в уведомлениях."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className={cn('grid gap-4', active && next ? 'lg:grid-cols-2' : '')}>
            {active ? <EventCard event={active} kind="active" now={now} /> : null}
            {next ? <EventCard event={next} kind="next" now={now} /> : null}
          </div>
          {rest.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-3">
              {rest.map((event) => (
                <EventCard key={event.id} event={event} kind="upcoming" now={now} />
              ))}
            </div>
          ) : null}
        </div>
      )}
    </HomeSection>
  );
}
