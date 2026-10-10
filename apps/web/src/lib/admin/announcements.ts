'use client';

import type { AdminAnnouncementDto, Paginated, UpsertAnnouncementRequest } from '@twomc/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

/// Управление объявлениями (ADR-0081).
const BASE = '/admin/communications/announcements';
const KEY = ['admin', 'announcements'] as const;

export function useAdminAnnouncements(enabled = true) {
  return useQuery({
    queryKey: KEY,
    queryFn: () => api.get<Paginated<AdminAnnouncementDto>>(BASE, { query: { limit: 100 } }),
    enabled,
  });
}

/// После любого изменения — свежий список админки и публичные объявления.
function useInvalidate() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: KEY });
    void client.invalidateQueries({ queryKey: ['site', 'announcements'] });
  };
}

export function useSaveAnnouncement() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: UpsertAnnouncementRequest }) =>
      id
        ? api.patch<AdminAnnouncementDto>(`${BASE}/${id}`, body)
        : api.post<AdminAnnouncementDto>(BASE, body),
    onSuccess: invalidate,
  });
}

export function useAnnouncementAction() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'publish' | 'unpublish' | 'delete' }) =>
      action === 'delete'
        ? api.delete<{ id: string }>(`${BASE}/${id}`)
        : api.post<AdminAnnouncementDto>(`${BASE}/${id}/${action}`),
    onSuccess: invalidate,
  });
}
