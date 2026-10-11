'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

/// Сайты голосования в админке (срез 7.4, ADR-0144): список, создание и
/// правка, удаление, замена секрета вебхука. Секрет API отдаёт один раз — при
/// создании и при замене, храня только хеш.

export interface AdminVoteSite {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  url: string;
  logoUrl: string | null;
  rewardCoins: number;
  cooldownHours: number;
  sortOrder: number;
  isActive: boolean;
}

export interface VoteSiteInput {
  slug: string;
  name: string;
  description?: string;
  url: string;
  logoUrl?: string;
  rewardCoins: number;
  cooldownHours: number;
  sortOrder: number;
}

/// Правка: slug не меняется; null убирает логотип.
export interface VoteSitePatch {
  name?: string;
  description?: string;
  url?: string;
  logoUrl?: string | null;
  rewardCoins?: number;
  cooldownHours?: number;
  sortOrder?: number;
  isActive?: boolean;
}

export const adminVotingKeys = {
  all: ['admin', 'voting', 'sites'] as const,
};

export function useAdminVoteSites() {
  return useQuery({
    queryKey: adminVotingKeys.all,
    queryFn: () => api.get<AdminVoteSite[]>('/admin/voting/sites'),
  });
}

export function useAdminVoteSiteActions() {
  const client = useQueryClient();
  const onSuccess = () => client.invalidateQueries({ queryKey: adminVotingKeys.all });
  const create = useMutation({
    mutationFn: (body: VoteSiteInput) =>
      api.post<{ site: AdminVoteSite; secret: string }>('/admin/voting/sites', body),
    onSuccess,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: VoteSitePatch }) =>
      api.patch<AdminVoteSite>(`/admin/voting/sites/${encodeURIComponent(id)}`, body),
    onSuccess,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/voting/sites/${encodeURIComponent(id)}`),
    onSuccess,
  });
  const rotate = useMutation({
    mutationFn: (id: string) =>
      api.post<{ secret: string }>(`/admin/voting/sites/${encodeURIComponent(id)}/rotate-secret`),
  });
  return { create, update, remove, rotate };
}
