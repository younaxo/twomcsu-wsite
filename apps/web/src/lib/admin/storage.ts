'use client';

import type {
  StorageCleanupPreview,
  StorageCleanupPreviewRequest,
  StorageCleanupRequest,
  StorageCleanupResult,
  StorageOverviewDto,
  UpdateStorageRetentionRequest,
} from '@twomc/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

/// Хранилище и журналы (ADR-0084).
const BASE = '/admin/system/storage';
const KEY = ['admin', 'system', 'storage'] as const;

export function useStorageOverview(enabled = true) {
  return useQuery({
    queryKey: KEY,
    queryFn: () => api.get<StorageOverviewDto>(BASE),
    enabled,
  });
}

export function useUpdateStorageRetention() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateStorageRetentionRequest) => api.patch<StorageOverviewDto>(BASE, body),
    onSuccess: (data) => client.setQueryData(KEY, data),
  });
}

export function useStoragePreview() {
  return useMutation({
    mutationFn: (body: StorageCleanupPreviewRequest) =>
      api.post<StorageCleanupPreview>(`${BASE}/preview`, body),
  });
}

export function useStorageCleanup() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: StorageCleanupRequest) =>
      api.post<StorageCleanupResult>(`${BASE}/cleanup`, body),
    onSuccess: () => void client.invalidateQueries({ queryKey: KEY }),
  });
}
