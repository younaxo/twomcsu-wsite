'use client';

import type { CalendarEventDto } from '@twomc/shared';
import { CalendarDays } from 'lucide-react';
import { useState } from 'react';
import { EventCard } from '@/app/(site)/_components/events-section';
import { PageHeader } from '@/components/admin/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { SkeletonRows } from '@/components/ui/skeleton';
import { useAuthStore } from '@/lib/auth/store';
import { useEventsList, useMyEvents } from '@/lib/events/hooks';

/// «События» (срез 3.4, ADR-0118): опубликованные события и «Мои события»
/// (вошедшим — куда записан или интересно).
function EventList({ items, empty }: { items: CalendarEventDto[]; empty: string }) {
  if (items.length === 0) {
    return <EmptyState icon={<CalendarDays />} title="Событий нет" description={empty} />;
  }
  const now = new Date();
  return (
    <ul className="grid gap-4 md:grid-cols-2" data-testid="events-list">
      {items.map((event) => (
        <li key={event.id}>
          <EventCard event={event} kind="upcoming" now={now} />
        </li>
      ))}
    </ul>
  );
}

export default function EventsPage() {
  const signedIn = useAuthStore((state) => state.status === 'authenticated');
  const [tab, setTab] = useState<'all' | 'mine'>('all');
  const all = useEventsList();
  const mine = useMyEvents(signedIn && tab === 'mine');
  const query = tab === 'mine' ? mine : all;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6">
      <PageHeader title="События" description="Турниры, ивенты и встречи сообщества twomc.su." />
      {signedIn ? (
        <SegmentedControl
          size="sm"
          value={tab}
          onValueChange={(value) => setTab(value as 'all' | 'mine')}
          options={[
            { value: 'all', label: 'Все события' },
            { value: 'mine', label: 'Мои события' },
          ]}
        />
      ) : null}
      {query.isPending ? (
        <SkeletonRows rows={5} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <EventList
          items={Array.isArray(query.data) ? query.data : (query.data?.items ?? [])}
          empty={
            tab === 'mine'
              ? 'Вы пока не записались ни на одно событие.'
              : 'Ближайшие события появятся здесь.'
          }
        />
      )}
    </div>
  );
}
