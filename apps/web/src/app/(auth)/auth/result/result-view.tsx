'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AuthShell } from '@/components/auth/auth-shell';
import { SocialAuthResult, useCountdown } from '@/components/auth/social-auth-result';
import { TwoFactorLoginStep } from '@/components/auth/two-factor-login-step';
import { Button } from '@/components/ui/button';
import { parseSocialResult, requestLinkUrl, socialLoginHref } from '@/lib/auth/social';
import { useAuthStore } from '@/lib/auth/store';

const AUTO_CONTINUE_S = 4;

/// /auth/result — итог входа/привязки через Discord/Telegram (ADR-0071).
/// Backend уже выставил httpOnly refresh-cookie (успешный вход) — здесь сессия
/// поднимается через /auth/refresh; в URL токенов нет.
export function SocialResultView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const result = parseSocialResult(searchParams);
  const status = useAuthStore((state) => state.status);
  const bootstrap = useAuthStore((state) => state.bootstrap);
  const [sessionFailed, setSessionFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const loginSuccess = result?.mode === 'login' && result.status === 'success';

  // Один раз поднимаем сессию из refresh-cookie, выставленной backend'ом;
  // неудача видна по итоговому статусу store.
  const attempted = useRef(false);
  useEffect(() => {
    if (!loginSuccess || attempted.current || status === 'authenticated') return;
    attempted.current = true;
    bootstrap()
      .then(() => {
        if (useAuthStore.getState().status !== 'authenticated') setSessionFailed(true);
      })
      .catch(() => setSessionFailed(true));
  }, [loginSuccess, status, bootstrap]);

  const target = result?.next ?? '/';
  const goNext = useCallback(() => router.replace(target), [router, target]);
  const ready = loginSuccess && status === 'authenticated';
  const countdown = useCountdown(AUTO_CONTINUE_S, ready, goNext);

  if (!result) {
    return (
      <AuthShell title="Страница не найдена" description="Ссылка на результат входа неполная.">
        <Button size="lg" onClick={() => router.replace('/login')}>
          Вернуться ко входу
        </Button>
      </AuthShell>
    );
  }

  // Внешний аккаунт подтверждён, включена 2FA — тот же второй шаг, что после
  // пароля (челлендж уже в httpOnly cookie, ADR-0109).
  if (result.mode === 'login' && result.status === 'two_factor') {
    return (
      <AuthShell
        title="Подтверждение входа"
        description="Аккаунт защищён двухфакторной аутентификацией."
      >
        <TwoFactorLoginStep onDone={goNext} onRestart={() => router.replace('/login')} />
      </AuthShell>
    );
  }

  const effectiveStatus = loginSuccess && sessionFailed ? 'error' : result.status;
  const retry = async () => {
    setRetrying(true);
    if (result.mode === 'login') {
      window.location.assign(socialLoginHref(result.provider, result.next));
      return;
    }
    try {
      const { url } = await requestLinkUrl(result.provider);
      window.location.assign(url);
    } catch {
      // Сессии нет или сеть недоступна — подключение начинается из настроек.
      router.replace('/settings/linked-accounts');
    }
  };

  return (
    <SocialAuthResult
      provider={result.provider}
      mode={result.mode}
      status={effectiveStatus}
      pending={loginSuccess && !sessionFailed && status !== 'authenticated'}
      autoContinueIn={countdown}
      onPrimary={() =>
        loginSuccess && !sessionFailed
          ? goNext()
          : router.replace(result.mode === 'link' ? '/settings/linked-accounts' : '/login')
      }
      onRetry={() => void retry()}
      retrying={retrying}
    />
  );
}
