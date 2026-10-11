'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

/// События в админке (срез 7.4, ADR-0148): список с фильтром по статусу,
/// редактор, публикация, отмена (участники получают уведомление), удаление.

export type EventCategory =
  'COMMUNITY' | 'TOURNAMENT' | 'UPDATE' | 'MAINTENANCE' | 'HOLIDAY' | 'OTHER';

export const EVENT_CATEGORY_LABEL: Record<EventCategory, string> = {
  COMMUNITY: 'Сообщество',
  TOURNAMENT: 'Турнир',
  UPDATE: 'Обновление',
  MAINTENANCE: 'Техработы',
  HOLIDAY: 'Праздник',
  OTHER: 'Другое',
};

export type EventStatus = 'DRAFT' | 'PUBLISHED' | 'CANCELLED' | 'COMPLETED';

export const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  DRAFT: 'Черновик',
  PUBLISHED: 'Опубликовано',
  CANCELLED: 'Отменено',
  COMPLETED: 'Прошло',
};

export type EventVisibility = 'PUBLIC' | 'AUTHENTICATED' | 'STAFF';

export const EVENT_VISIBILITY_LABEL: Record<EventVisibility, string> = {
  PUBLIC: 'Всем',
  AUTHENTICATED: 'Вошедшим',
  STAFF: 'Персоналу',
};

export interface AdminEvent {
  id: string;
  slug: string;
  title: string;
  description: string;
  coverImage: string | null;
  category: EventCategory;
  visibility: EventVisibility;
  status: EventStatus;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  server: string | null;
  maxParticipants: number | null;
  registrationDeadline: string | null;
  _count?: { participants: number };
}

export interface EventInput {
  title: string;
  description: string;
  category: EventCategory;
  visibility: EventVisibility;
  startsAt: string;
  endsAt?: string;
  location: string;
  server: string;
  maxParticipants?: number;
  registrationDeadline?: string;
  coverImage?: string | null;
}

export const adminEventKeys = {
  all: ['admin', 'events'] as const,
  list: (status: EventStatus | '', page: number) =>
    ['admin', 'events', 'list', status, page] as const,
};

export const ADMIN_EVENTS_PAGE_SIZE = 20;

export function useAdminEvents(status: EventStatus | '', page: number) {
  return useQuery({
    queryKey: adminEventKeys.list(status, page),
    queryFn: () =>
      api.get<{ items: AdminEvent[]; total: number }>('/admin/events', {
        query: { page, limit: ADMIN_EVENTS_PAGE_SIZE, ...(status ? { status } : {}) },
      }),
  });
}

export function useAdminEventActions() {
  const client = useQueryClient();
  const onSuccess = () => client.invalidateQueries({ queryKey: adminEventKeys.all });
  const create = useMutation({
    mutationFn: (body: EventInput & { slug: string }) =>
      api.post<AdminEvent>('/admin/events', body),
    onSuccess,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: EventInput }) =>
      api.patch<AdminEvent>(`/admin/events/${encodeURIComponent(id)}`, body),
    onSuccess,
  });
  const setStatus = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'publish' | 'cancel' }) =>
      api.post(`/admin/events/${encodeURIComponent(id)}/${action}`),
    onSuccess,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/events/${encodeURIComponent(id)}`),
    onSuccess,
  });
  return { create, update, setStatus, remove };
}

export type AttendanceStatus = 'GOING' | 'INTERESTED' | 'DECLINED';

export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  GOING: 'Идёт',
  INTERESTED: 'Интересуется',
  DECLINED: 'Отказался',
};

export interface EventParticipantDto {
  status: AttendanceStatus;
  createdAt: string;
  user: { id: string; username: string; tag: string; avatar: string | null };
}

/// Участники события (ADR-0151) — публичные поля пользователя и статус.
export function useEventParticipants(id: string | null) {
  return useQuery({
    queryKey: ['admin', 'events', 'participants', id ?? ''] as const,
    queryFn: () =>
      api.get<EventParticipantDto[]>(`/admin/events/${encodeURIComponent(id!)}/participants`),
    enabled: !!id,
  });
}
