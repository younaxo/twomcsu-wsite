'use client';

import { useState } from 'react';
import { BrandIcon } from '@/components/shell/brand-icon';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api/errors';
import { useAuthStore } from '@/lib/auth/store';
import {
  describeSocialError,
  discordLoginHref,
  requestTelegramAuth,
  telegramLogin,
  useSocialProviders,
} from '@/lib/auth/social';

function errorCode(error: unknown): string {
  if (error instanceof ApiError && error.body && typeof error.body === 'object') {
    const body = error.body as { code?: unknown; message?: unknown };
    if (typeof body.code === 'string') return body.code;
    if (body.message && typeof body.message === 'object') {
      const nested = (body.message as { code?: unknown }).code;
      if (typeof nested === 'string') return nested;
    }
  }
  return 'social_failed';
}

/// «или» + вход через Discord/Telegram (ADR-0069). Только для аккаунтов,
/// заранее привязанных в профиле — иначе понятная ошибка, без автосоздания.
/// Кнопки показываются, только если провайдер настроен на backend.
export function SocialLogin({
  next,
  onError,
  onSuccess,
}: {
  next: string;
  onError: (message: string | null) => void;
  onSuccess: () => void;
}) {
  const providers = useSocialProviders();
  const acceptSession = useAuthStore((state) => state.acceptSession);
  const [telegramPending, setTelegramPending] = useState(false);
  const discord = providers.data?.discord.enabled ?? false;
  const telegram = providers.data?.telegram;

  if (!discord && !telegram?.enabled) {
    return null;
  }

  const loginWithTelegram = async () => {
    if (!telegram?.botId) return;
    onError(null);
    setTelegramPending(true);
    try {
      const payload = await requestTelegramAuth(telegram.botId);
      if (!payload) return;
      const session = await telegramLogin(payload);
      await acceptSession(session.accessToken);
      onSuccess();
    } catch (error) {
      onError(describeSocialError(errorCode(error)));
    } finally {
      setTelegramPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-3" data-testid="social-login">
      <div className="flex items-center gap-3 text-xs text-subtle-foreground" aria-hidden>
        <span className="h-px flex-1 bg-border-subtle" />
        или
        <span className="h-px flex-1 bg-border-subtle" />
      </div>
      {discord ? (
        <Button asChild variant="secondary" size="lg">
          <a href={discordLoginHref(next)} data-social="discord">
            <BrandIcon id="discord" className="size-[18px] text-[#5865F2]" />
            Продолжить через Discord
          </a>
        </Button>
      ) : null}
      {telegram?.enabled ? (
        <Button
          variant="secondary"
          size="lg"
          loading={telegramPending}
          onClick={() => void loginWithTelegram()}
          data-social="telegram"
        >
          <BrandIcon id="telegram" className="size-[18px] text-[#26A5E4]" />
          Продолжить через Telegram
        </Button>
      ) : null}
      <p className="text-center text-xs text-subtle-foreground">
        Только для аккаунтов, привязанных в настройках профиля.
      </p>
    </div>
  );
}
