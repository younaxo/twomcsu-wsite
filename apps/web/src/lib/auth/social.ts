'use client';

import type {
  ExternalProvider,
  LinkedAccountDto,
  LoginResponse,
  SocialProvidersResponse,
  TelegramAuthPayload,
} from '@twomc/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { API_URL } from '@/lib/env';

/// Вход через Discord/Telegram (ADR-0069) — только для уже привязанных
/// аккаунтов. Привязка — из «Настройки → Связанные аккаунты».

export const socialKeys = {
  providers: ['auth', 'social', 'providers'] as const,
  linked: ['auth', 'linked-accounts'] as const,
};

export function useSocialProviders() {
  return useQuery({
    queryKey: socialKeys.providers,
    queryFn: () => api.get<SocialProvidersResponse>('/auth/social/providers', { auth: false }),
    staleTime: 5 * 60_000,
  });
}

/// Вход через Discord — обычный переход браузера на API (OAuth redirect).
export function discordLoginHref(next: string): string {
  return `${API_URL}/auth/discord/start?next=${encodeURIComponent(next)}`;
}

interface TelegramLoginApi {
  auth: (
    options: { bot_id: string; request_access?: boolean; lang?: string },
    callback: (data: TelegramAuthPayload | false) => void,
  ) => void;
}

declare global {
  interface Window {
    Telegram?: { Login?: TelegramLoginApi };
  }
}

let telegramScript: Promise<void> | null = null;

/// Официальный скрипт Telegram Login (popup с кнопкой в нашем стиле).
function loadTelegramScript(): Promise<void> {
  if (window.Telegram?.Login) return Promise.resolve();
  if (!telegramScript) {
    telegramScript = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://telegram.org/js/telegram-widget.js?22';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        telegramScript = null;
        reject(new Error('telegram_script_failed'));
      };
      document.head.appendChild(script);
    });
  }
  return telegramScript;
}

/// Открывает окно авторизации Telegram; null — пользователь закрыл окно.
export async function requestTelegramAuth(botId: string): Promise<TelegramAuthPayload | null> {
  await loadTelegramScript();
  const login = window.Telegram?.Login;
  if (!login) throw new Error('telegram_script_failed');
  return new Promise((resolve) => {
    login.auth({ bot_id: botId, request_access: false, lang: 'ru' }, (data) =>
      resolve(data || null),
    );
  });
}

export function telegramLogin(payload: TelegramAuthPayload) {
  return api.post<LoginResponse>(
    '/auth/telegram/login',
    { payload },
    { auth: false, retryOn401: false },
  );
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
  const set = (data: LinkedAccountDto[]) => client.setQueryData(socialKeys.linked, data);
  return {
    linkTelegram: useMutation({
      mutationFn: (payload: TelegramAuthPayload) =>
        api.post<LinkedAccountDto[]>('/auth/telegram/link', { payload }),
      onSuccess: set,
    }),
    discordLinkUrl: useMutation({
      mutationFn: () => api.post<{ url: string }>('/auth/discord/link-url'),
    }),
    unlink: useMutation({
      mutationFn: (provider: ExternalProvider) =>
        api.delete<LinkedAccountDto[]>(`/auth/linked-accounts/${provider}`),
      onSuccess: set,
    }),
  };
}

export const PROVIDER_LABEL: Record<ExternalProvider, string> = {
  discord: 'Discord',
  telegram: 'Telegram',
};

/// Понятные сообщения по кодам backend (без технических деталей).
export function describeSocialError(code: string | null | undefined): string | null {
  if (!code) return null;
  switch (code) {
    case 'discord_not_linked':
      return 'Этот Discord-аккаунт не привязан к twomc.su. Войдите обычным способом и привяжите аккаунт в настройках профиля.';
    case 'telegram_not_linked':
      return 'Этот Telegram-аккаунт не привязан к twomc.su. Войдите обычным способом и привяжите аккаунт в настройках профиля.';
    case 'external_taken':
      return 'Этот аккаунт уже привязан к другому пользователю twomc.su.';
    case 'already_linked':
      return 'К вашему аккаунту уже привязан другой аккаунт этого сервиса — сначала отвяжите его.';
    case 'discord_cancelled':
      return 'Вход через Discord отменён.';
    case 'state_expired':
    case 'invalid_state':
      return 'Сессия входа устарела. Попробуйте ещё раз.';
    case 'telegram_expired':
      return 'Данные Telegram устарели — повторите вход.';
    default:
      return 'Не удалось войти через внешний сервис. Попробуйте ещё раз.';
  }
}
