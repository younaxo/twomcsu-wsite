'use client';

import type {
  OwnProfileDto,
  ProfileSocialLinkDto,
  SocialPlatform,
  UpdateOwnProfileRequest,
} from '@twomc/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { useAuthStore } from '@/lib/auth/store';

/// Собственный профиль, приватность, соцсети, аватар и баннер (волна 1).
export const accountKeys = {
  profile: ['account', 'profile'] as const,
  socialLinks: ['account', 'social-links'] as const,
};

export function useOwnProfile() {
  const authenticated = useAuthStore((state) => state.status === 'authenticated');
  return useQuery({
    queryKey: accountKeys.profile,
    queryFn: () => api.get<OwnProfileDto>('/users/me/profile'),
    enabled: authenticated,
  });
}

export function useUpdateProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateOwnProfileRequest) =>
      api.patch<OwnProfileDto>('/users/me/profile', body),
    onSuccess: (data) => client.setQueryData(accountKeys.profile, data),
  });
}

export function useSocialLinks() {
  const authenticated = useAuthStore((state) => state.status === 'authenticated');
  return useQuery({
    queryKey: accountKeys.socialLinks,
    queryFn: () => api.get<ProfileSocialLinkDto[]>('/users/me/social-links'),
    enabled: authenticated,
  });
}

export function useSaveSocialLink() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ platform, value }: { platform: SocialPlatform; value: string | null }) =>
      value
        ? api.put(`/users/me/social-links/${platform}`, { value })
        : api.delete(`/users/me/social-links/${platform}`),
    onSuccess: () => void client.invalidateQueries({ queryKey: accountKeys.socialLinks }),
  });
}

export type ProfileImageKind = 'avatar' | 'banner';

/// Загрузка или удаление аватара/баннера; после — свежий профиль и `/auth/me`.
export function useProfileImage(kind: ProfileImageKind) {
  const client = useQueryClient();
  const reloadUser = useAuthStore((state) => state.reload);
  const done = () => {
    void client.invalidateQueries({ queryKey: accountKeys.profile });
    void reloadUser();
  };
  const upload = useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.append('file', file);
      return api.post(`/users/me/${kind}`, body);
    },
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/users/me/${kind}`),
    onSuccess: done,
  });
  return { upload, remove };
}
