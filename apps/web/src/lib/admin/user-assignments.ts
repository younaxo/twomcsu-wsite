'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { queryKeys } from '@/lib/query/keys';

/// Назначения игроку из карточки в админке (срез 7.6, ADR-0142): должность,
/// отделы, своя должность, награды. Каждое действие — по своему праву
/// (`positions.assign`, `departments.assign`, `custom_positions.assign`,
/// `users.awards`); API проверяет независимо.

export interface UserAwardEntry {
  awardId: string;
  grantedAt: string;
  award: { id: string; name: string; iconUrl: string; rarity: string | null };
}

const awardsKey = (userId: string) => ['admin', 'users', userId, 'awards'] as const;
const enc = encodeURIComponent;

export function useUserAwards(userId: string, enabled: boolean) {
  return useQuery({
    queryKey: awardsKey(userId),
    queryFn: () => api.get<UserAwardEntry[]>(`/admin/users/${enc(userId)}/awards`),
    enabled,
  });
}

export function useUserAssignments(userId: string) {
  const client = useQueryClient();
  const refreshUser = () => client.invalidateQueries({ queryKey: queryKeys.users.detail(userId) });
  const refreshAwards = () => client.invalidateQueries({ queryKey: awardsKey(userId) });

  const assignPosition = useMutation({
    mutationFn: (positionId: string) =>
      api.post(`/positions/${enc(positionId)}/assign`, { userId }),
    onSuccess: refreshUser,
  });
  const addDepartment = useMutation({
    mutationFn: (departmentId: string) =>
      api.post(`/admin/users/${enc(userId)}/departments/${enc(departmentId)}`),
    onSuccess: refreshUser,
  });
  const removeDepartment = useMutation({
    mutationFn: (departmentId: string) =>
      api.delete(`/admin/users/${enc(userId)}/departments/${enc(departmentId)}`),
    onSuccess: refreshUser,
  });
  const setCustomPosition = useMutation({
    mutationFn: (customPositionId: string) =>
      api.post(`/admin/users/${enc(userId)}/custom-position`, { customPositionId }),
    onSuccess: refreshUser,
  });
  const clearCustomPosition = useMutation({
    mutationFn: () => api.delete(`/admin/users/${enc(userId)}/custom-position`),
    onSuccess: refreshUser,
  });
  const grantAward = useMutation({
    mutationFn: (awardId: string) => api.post(`/admin/users/${enc(userId)}/awards/${enc(awardId)}`),
    onSuccess: refreshAwards,
  });
  const revokeAward = useMutation({
    mutationFn: (awardId: string) =>
      api.delete(`/admin/users/${enc(userId)}/awards/${enc(awardId)}`),
    onSuccess: refreshAwards,
  });
  return {
    assignPosition,
    addDepartment,
    removeDepartment,
    setCustomPosition,
    clearCustomPosition,
    grantAward,
    revokeAward,
  };
}
