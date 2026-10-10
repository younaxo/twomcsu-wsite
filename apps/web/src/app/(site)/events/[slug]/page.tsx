'use client';

import { CalendarDays, Check, MapPin, Server, Star, Users, X } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { SafeMarkdown } from '@/components/ui/safe-markdown';
import { SkeletonRows } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { ApiError, getErrorMessage } from '@/lib/api/errors';
import { useAuthStore } from '@/lib/auth/store';
import { useAttendance, useEvent, type AttendanceStatus } from '@/lib/events/hooks';
import { formatDateTime, formatNumber } from '@/lib/format';

/// Событие (срез 3.4, ADR-0118): описание (безопасный Markdown), время, место,
/// участники; «Пойду» / «Интересно» / «Не пойду». Прошедшее — без записи.

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  GOING: 'Вы идёте',
  INTERESTED: 'Вам интересно',
  DECLINED: 'Вы не идёте',
};

export default function EventPage() {
  const { slug } = useParams<{ slug: string }>();
  const signedIn = useAuthStore((state) => state.status === 'authenticated');
  const event = useEvent(slug);
  const { attend, leave } = useAttendance();

  if (event.isPending) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <SkeletonRows rows={6} />
      </div>
    );
  }
  if (event.isError) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        {event.error instanceof ApiError && event.error.status === 404 ? (
          <EmptyState
            icon={<CalendarDays />}
            title="Событие не найдено"
            description="Его отменили, ещё не опубликовали или ссылка неверная."
          />
        ) : (
          <ErrorState error={event.error} onRetry={() => event.refetch()} />
        )}
      </div>
    );
  }

  const data = event.data;
  const finished = new Date(data.endsAt ?? data.startsAt) < new Date();
  const mark = (status: AttendanceStatus) =>
    attend.mutate(
      { id: data.id, status },
      {
        onSuccess: () => toast.success(STATUS_LABEL[status]),
        onError: (error) => toast.error(getErrorMessage(error)),
      },
    );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-8 md:px-6">
      <article
        className="flex flex-col gap-4 rounded-xl bg-surface p-6 shadow-sm"
        data-testid="event-details"
      >
        <div className="flex flex-wrap items-center gap-2">
          {data.isFeatured ? <Badge tone="primary">Главное событие</Badge> : null}
          {finished ? <Badge tone="neutral">Завершено</Badge> : null}
        </div>
        <h1 className="font-display text-3xl font-bold leading-tight">{data.title}</h1>
        <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
          <li className="flex items-center gap-2">
            <CalendarDays aria-hidden className="size-4" />
            {formatDateTime(data.startsAt)}
            {data.endsAt ? ` — ${formatDateTime(data.endsAt)}` : ''}
          </li>
          {data.location ? (
            <li className="flex items-center gap-2">
              <MapPin aria-hidden className="size-4" />
              {data.location}
            </li>
          ) : null}
          {data.server ? (
            <li className="flex items-center gap-2">
              <Server aria-hidden className="size-4" />
              {data.server}
            </li>
          ) : null}
          <li className="flex items-center gap-2" data-testid="event-participants">
            <Users aria-hidden className="size-4" />
            Участников: {formatNumber(data._count?.participants ?? 0)}
          </li>
        </ul>
        <SafeMarkdown source={data.description} className="text-base leading-relaxed" />
        <div
          className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3"
          data-testid="event-attendance"
        >
          {finished ? (
            <p className="text-sm text-muted-foreground">Событие уже прошло.</p>
          ) : !signedIn ? (
            <p className="text-sm text-muted-foreground">
              <Link
                href="/login"
                className="font-medium text-primary-soft-foreground hover:underline"
              >
                Войдите
              </Link>
              , чтобы записаться.
            </p>
          ) : (
            <>
              <Button
                size="sm"
                variant={data.myStatus === 'GOING' ? 'primary' : 'secondary'}
                aria-pressed={data.myStatus === 'GOING'}
                loading={attend.isPending && attend.variables?.status === 'GOING'}
                onClick={() => mark('GOING')}
              >
                <Check />
                Пойду
              </Button>
              <Button
                size="sm"
                variant={data.myStatus === 'INTERESTED' ? 'primary' : 'secondary'}
                aria-pressed={data.myStatus === 'INTERESTED'}
                loading={attend.isPending && attend.variables?.status === 'INTERESTED'}
                onClick={() => mark('INTERESTED')}
              >
                <Star />
                Интересно
              </Button>
              {data.myStatus ? (
                <Button
                  size="sm"
                  variant="ghost"
                  loading={leave.isPending}
                  onClick={() =>
                    leave.mutate(data.id, {
                      onSuccess: () => toast.success('Вы больше не участвуете'),
                      onError: (error) => toast.error(getErrorMessage(error)),
                    })
                  }
                >
                  <X />
                  Не пойду
                </Button>
              ) : null}
            </>
          )}
        </div>
      </article>
    </div>
  );
}
