'use client';

import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { TURNSTILE_SITE_KEY } from '@/lib/env';
import { useTheme } from '@/lib/theme/theme-provider';

/// Cloudflare Turnstile — единый anti-bot виджет публичных форм (вход,
/// регистрация, восстановление пароля, обращения). Скрипт грузится один раз,
/// виджет рендерится явно (`render=explicit`), токен отдаётся родителю через
/// `onToken`; backend обязан подтвердить его через Siteverify — токен на
/// frontend сам по себе ничего не значит. В dev используется официальный
/// тестовый site key Cloudflare (всегда проходит), секрета здесь нет.

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const SCRIPT_ID = 'cf-turnstile-script';

interface TurnstileApi {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      'error-callback'?: () => void;
      'expired-callback'?: () => void;
      theme?: 'light' | 'dark' | 'auto';
      size?: 'normal' | 'compact' | 'flexible';
      language?: string;
      action?: string;
    },
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Turnstile доступен только в браузере'));
  }
  if (window.turnstile) {
    return Promise.resolve(window.turnstile);
  }
  if (!scriptPromise) {
    scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
      const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
      const script = existing ?? document.createElement('script');
      const done = () => {
        if (window.turnstile) {
          resolve(window.turnstile);
        } else {
          reject(new Error('Turnstile не инициализировался'));
        }
      };
      script.addEventListener('load', done, { once: true });
      script.addEventListener(
        'error',
        () => {
          scriptPromise = null;
          reject(new Error('Не удалось загрузить Turnstile'));
        },
        { once: true },
      );
      if (!existing) {
        script.id = SCRIPT_ID;
        script.src = SCRIPT_SRC;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      }
    });
  }
  return scriptPromise;
}

export interface TurnstileHandle {
  /// Сбросить виджет (после ошибки входа / истёкшего токена).
  reset: () => void;
}

export interface TurnstileProps {
  /// Получен новый токен (`null` — истёк или ошибка виджета).
  onToken: (token: string | null) => void;
  /// Имя действия для аналитики Cloudflare (login, register, …).
  action?: string;
  className?: string;
}

export const Turnstile = forwardRef<TurnstileHandle, TurnstileProps>(function Turnstile(
  { onToken, action, className },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'unconfigured'>(
    TURNSTILE_SITE_KEY ? 'loading' : 'unconfigured',
  );
  const { resolved: resolvedTheme } = useTheme();
  const describedId = useId();

  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useImperativeHandle(ref, () => ({
    reset: () => {
      if (widgetRef.current && window.turnstile) {
        window.turnstile.reset(widgetRef.current);
        onTokenRef.current(null);
      }
    },
  }));

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !containerRef.current) {
      return;
    }
    let cancelled = false;
    const container = containerRef.current;
    loadTurnstile()
      .then((api) => {
        if (cancelled || !container.isConnected) return;
        widgetRef.current = api.render(container, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: resolvedTheme === 'light' ? 'light' : 'dark',
          size: 'flexible',
          language: 'ru',
          action,
          callback: (token) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => {
            onTokenRef.current(null);
            setStatus('error');
          },
        });
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
      if (widgetRef.current && window.turnstile) {
        window.turnstile.remove(widgetRef.current);
        widgetRef.current = null;
      }
    };
    // Пересоздаём виджет только при смене темы — токен при этом сбрасывается.
  }, [resolvedTheme, action]);

  if (status === 'unconfigured') {
    return (
      <p
        data-testid="turnstile-unconfigured"
        className={cn(
          'rounded border border-dashed border-border-strong/60 px-3 py-2 text-xs text-muted-foreground',
          className,
        )}
      >
        Защита от ботов не настроена: задайте NEXT_PUBLIC_TURNSTILE_SITE_KEY (в dev — тестовый ключ
        Cloudflare).
      </p>
    );
  }

  return (
    <div className={cn('flex flex-col gap-1', className)} data-testid="turnstile">
      <div ref={containerRef} aria-describedby={describedId} className="min-h-[65px]" />
      <p id={describedId} className="sr-only">
        Проверка Cloudflare Turnstile, что вы не робот.
      </p>
      {status === 'error' ? (
        <p role="alert" className="text-xs text-destructive">
          Не удалось загрузить проверку Cloudflare. Обновите страницу или отключите блокировщик.
        </p>
      ) : null}
    </div>
  );
});
