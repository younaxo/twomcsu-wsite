'use client';

import type {
  ExternalProvider,
  LinkedAccountDto,
  SocialAuthMode,
  SocialProvidersResponse,
  SocialResultStatus,
} from '@twomc/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { API_URL } from '@/lib/env';

/// Вход через Discord/Telegram (ADR-0069, ADR-0071) — только для уже
/// привязанных аккаунтов. Оба провайдера — серверный redirect-flow (Discord
/// OAuth2, Telegram OpenID Connect + PKCE); результат приходит на
/// `/auth/result` статусом, без токенов в URL.

export const socialKeys = {
  providers: ['auth', 'social', 'providers'] as const,
  linked: ['auth', 'linked-accounts'] as const,
};

export const PROVIDERS: ExternalProvider[] = ['discord', 'telegram'];

export const PROVIDER_LABEL: Record<ExternalProvider, string> = {
  discord: 'Discord',
  telegram: 'Telegram',
};

export function useSocialProviders() {
  return useQuery({
    queryKey: socialKeys.providers,
    queryFn: () => api.get<SocialProvidersResponse>('/auth/social/providers', { auth: false }),
    staleTime: 5 * 60_000,
  });
}

/// Вход — обычный переход браузера на API (redirect к провайдеру).
export function socialLoginHref(provider: ExternalProvider, next: string): string {
  const query = next && next !== '/' ? `?next=${encodeURIComponent(next)}` : '';
  return `${API_URL}/auth/${provider}/start${query}`;
}

/// Привязка: API выдаёт URL с подписанным state (mode=link, id пользователя).
export function requestLinkUrl(provider: ExternalProvider) {
  return api.post<{ url: string }>(`/auth/${provider}/link-url`);
}

export function useLinkedAccounts(enabled = true) {
  return useQuery({
    queryKey: socialKeys.linked,
    queryFn: () => api.get<LinkedAccountDto[]>('/auth/linked-accounts'),
    enabled,
  });
}

export function useLinkedAccountMutations() {
  const client = useQueryClient();
  return {
    linkUrl: useMutation({ mutationFn: requestLinkUrl }),
    unlink: useMutation({
      mutationFn: (provider: ExternalProvider) =>
        api.delete<LinkedAccountDto[]>(`/auth/linked-accounts/${provider}`),
      onSuccess: (data) => client.setQueryData(socialKeys.linked, data),
    }),
  };
}

const STATUSES: SocialResultStatus[] = [
  'success',
  'linked',
  'already_linked',
  'not_linked',
  'taken',
  'slot_taken',
  'cancelled',
  'expired',
  'unavailable',
  'error',
];

/// Разбор `/auth/result?…`: неизвестные значения → безопасные значения по
/// умолчанию (провайдер обязателен, иначе null).
export function parseSocialResult(params: URLSearchParams): {
  provider: ExternalProvider;
  mode: SocialAuthMode;
  status: SocialResultStatus;
  next: string;
} | null {
  const provider = params.get('provider');
  if (provider !== 'discord' && provider !== 'telegram') return null;
  const mode = params.get('mode') === 'link' ? 'link' : 'login';
  const raw = params.get('status') as SocialResultStatus | null;
  const status = raw && STATUSES.includes(raw) ? raw : 'error';
  const nextRaw = params.get('next');
  const next =
    nextRaw && nextRaw.startsWith('/') && !nextRaw.startsWith('//')
      ? nextRaw
      : mode === 'link'
        ? '/settings/linked-accounts'
        : '/';
  return { provider, mode, status, next };
}
