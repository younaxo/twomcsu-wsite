import type { LoginCaptchaRequired, LoginRequest, LoginResponse, MeResponse } from '@twomc/shared';
import { create } from 'zustand';
import { api, refreshAccessToken, setSessionExpiredHandler } from '../api/client';
import { ApiError } from '../api/errors';
import { tokenStore } from '../api/token-store';
import { unsubscribeThisDevice } from '@/lib/notifications/push';

export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'anonymous';

export interface AuthState {
  status: AuthStatus;
  user: MeResponse | null;
  /// Восстановить сессию по refresh-cookie при загрузке приложения.
  bootstrap: () => Promise<void>;
  login: (request: LoginRequest) => Promise<MeResponse>;
  /// Принять готовую сессию (вход через Telegram: backend вернул access-токен).
  acceptSession: (accessToken: string) => Promise<MeResponse>;
  logout: () => Promise<void>;
  /// Перечитать `/auth/me` (после смены ролей/прав текущего пользователя).
  reload: () => Promise<MeResponse | null>;
  /// Локально сбросить сессию (refresh не удался / токен отозван).
  clear: () => void;
}

/// Сервер отверг captcha (Turnstile-токен отсутствует или не прошёл Siteverify,
/// ADR-0059). Форма входа сбрасывает виджет и показывает явное сообщение
/// вместо тихого «неверный пароль».
export class CaptchaRequiredError extends Error {
  constructor() {
    super('Проверка Cloudflare не пройдена. Подтвердите, что вы не робот, и повторите.');
    this.name = 'CaptchaRequiredError';
  }
}

function isCaptchaRequired(
  body: LoginResponse | LoginCaptchaRequired,
): body is LoginCaptchaRequired {
  return (body as LoginCaptchaRequired).requiresCaptcha === true;
}

async function fetchMe(): Promise<MeResponse> {
  return api.get<MeResponse>('/auth/me');
}

let bootstrapPromise: Promise<void> | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'idle',
  user: null,

  bootstrap: () => {
    // Single-flight: React StrictMode в dev вызывает эффекты дважды, а два
    // параллельных refresh с одним cookie backend трактует как reuse → отзыв
    // всех сессий. Один общий промис на всё приложение.
    if (!bootstrapPromise) {
      bootstrapPromise = (async () => {
        set({ status: 'loading' });
        try {
          const token = tokenStore.get() ?? (await refreshAccessToken());
          if (!token) {
            set({ status: 'anonymous', user: null });
            return;
          }
          const user = await fetchMe();
          set({ status: 'authenticated', user });
        } catch (error) {
          if (error instanceof ApiError && error.isUnauthorized) {
            tokenStore.clear();
            set({ status: 'anonymous', user: null });
            return;
          }
          // Сеть/5xx: не считаем пользователя анонимным, чтобы не выкидывать на
          // /login из-за кратковременной недоступности API; UI покажет ошибку.
          set({ status: 'anonymous', user: null });
          throw error;
        }
      })().finally(() => {
        bootstrapPromise = null;
      });
    }
    return bootstrapPromise;
  },

  login: async (request) => {
    const body = await api.post<LoginResponse | LoginCaptchaRequired>('/auth/login', request, {
      auth: false,
      retryOn401: false,
    });
    if (isCaptchaRequired(body)) {
      throw new CaptchaRequiredError();
    }
    tokenStore.set(body.accessToken);
    const user = await fetchMe();
    set({ status: 'authenticated', user });
    return user;
  },

  acceptSession: async (accessToken) => {
    tokenStore.set(accessToken);
    const user = await fetchMe();
    set({ status: 'authenticated', user });
    return user;
  },

  logout: async () => {
    try {
      // Сначала отписать push этого браузера (пока токен ещё действует), чтобы
      // после выхода сюда не приходили уведомления этого аккаунта (ADR-0097).
      await unsubscribeThisDevice().catch(() => undefined);
      await api.post('/auth/logout', undefined, { retryOn401: false, parse: 'none' });
    } catch {
      // Сессия могла уже истечь — локальная очистка всё равно обязательна.
    } finally {
      get().clear();
    }
  },

  reload: async () => {
    if (get().status !== 'authenticated') {
      return null;
    }
    const user = await fetchMe();
    set({ user });
    return user;
  },

  clear: () => {
    tokenStore.clear();
    set({ status: 'anonymous', user: null });
  },
}));

setSessionExpiredHandler(() => {
  useAuthStore.getState().clear();
});

/// Для тестов: сбросить single-flight bootstrap между кейсами.
export function resetAuthBootstrapForTests(): void {
  bootstrapPromise = null;
}
