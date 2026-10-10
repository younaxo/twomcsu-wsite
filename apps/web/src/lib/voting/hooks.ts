'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

/// Голосование (срез 3.7, ADR-0121): сайты-рейтинги, награда и таймер до
/// следующего голоса. Голос засчитывается вебхуком сайта-рейтинга по нику.

export interface VoteSiteDto {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  url: string;
  logoUrl: string | null;
  rewardCoins: number;
  cooldownHours: number;
  /// null — гость (таймер не известен).
  nextVoteAt: string | null;
  canVoteNow: boolean | null;
}

export const votingKeys = { all: ['voting'] as const };

export function useVoteSites(signedIn: boolean) {
  return useQuery({
    // Ответ зависит от сессии (таймер есть только у вошедшего).
    queryKey: [...votingKeys.all, signedIn],
    queryFn: () => api.get<VoteSiteDto[]>('/voting'),
  });
}
