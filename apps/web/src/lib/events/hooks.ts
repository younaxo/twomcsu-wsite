'use client';

import type { CalendarEventDto } from '@twomc/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

/// События (срез 3.4, ADR-0118): список, «Мои», карточка с участием.

export type AttendanceStatus = 'GOING' | 'INTERESTED' | 'DECLINED';

export interface EventDetailsDto extends CalendarEventDto {
  myStatus: AttendanceStatus | null;
  maxParticipants?: number | null;
  registrationDeadline?: string | null;
}

interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export const eventKeys = {
  all: ['events'] as const,
  list: ['events', 'list'] as const,
  mine: ['events', 'mine'] as const,
  one: (slug: string) => ['events', 'one', slug] as const,
};

export function useEventsList() {
  return useQuery({
    queryKey: eventKeys.list,
    queryFn: () => api.get<Page<CalendarEventDto>>('/events', { query: { limit: 50 } }),
  });
}

export function useMyEvents(enabled: boolean) {
  return useQuery({
    queryKey: eventKeys.mine,
    queryFn: () => api.get<CalendarEventDto[]>('/events/mine'),
    enabled,
  });
}

export function useEvent(slug: string) {
  return useQuery({
    queryKey: eventKeys.one(slug),
    queryFn: () =>
      api.get<EventDetailsDto>(`/events/${encodeURIComponent(slug)}`, { retryOn401: false }),
    retry: false,
  });
}

export function useAttendance() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: eventKeys.all });
  const attend = useMutation({
    mutationFn: ({ id, status }: { id: string; status: AttendanceStatus }) =>
      api.post(`/events/${encodeURIComponent(id)}/attendance`, { status }),
    onSuccess: refresh,
  });
  const leave = useMutation({
    mutationFn: (id: string) => api.delete(`/events/${encodeURIComponent(id)}/attendance`),
    onSuccess: refresh,
  });
  return { attend, leave };
}
