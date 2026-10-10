'use client';

import { LogIn } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { describeAuthError } from '@/components/auth/auth-errors';
import { AuthShell } from '@/components/auth/auth-shell';
import { PasswordField } from '@/components/auth/password-field';
import { SocialLogin } from '@/components/auth/social-login';
import { Turnstile, type TurnstileHandle } from '@/components/auth/turnstile';
import { TwoFactorLoginStep } from '@/components/auth/two-factor-login-step';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { TURNSTILE_SITE_KEY } from '@/lib/env';
import { CaptchaRequiredError, TwoFactorRequiredError, useAuthStore } from '@/lib/auth/store';

/// Куда вести после входа: только внутренние пути (без `//evil.com`).
export function safeNext(value: string | null, fallback = '/'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return fallback;
  }
  return value;
}

/// Вход «Полдня»: логин/e-mail, пароль с показом, Turnstile (проверяется
/// backend-ом через Siteverify), состояния loading/error/rate-limit/captcha.
/// «Запомнить устройство» backend не поддерживает (refresh-сессия и так
/// долгоживущая, ADR PHASE 05) — чекбокс не рисуем, чтобы не обещать лишнего.
/// `preview` — показ в design-lab: без автофокуса и без перехода для уже вошедших.
export function LoginForm({ preview = false }: { preview?: boolean } = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get('next'));
  const notice =
    searchParams.get('registered') === '1'
      ? 'Аккаунт создан — войдите, чтобы продолжить.'
      : searchParams.get('reset') === '1'
        ? 'Пароль изменён — войдите с новым паролем.'
        : null;
  const status = useAuthStore((state) => state.status);
  const bootstrap = useAuthStore((state) => state.bootstrap);
  const login = useAuthStore((state) => state.login);

  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /// Пароль верен, включена 2FA — второй шаг (ADR-0109).
  const [twoFactor, setTwoFactor] = useState(false);
  const turnstileRef = useRef<TurnstileHandle>(null);
  const errorId = useId();

  // Уже вошли (refresh-cookie жив) — сразу дальше.
  useEffect(() => {
    if (preview) return;
    if (status === 'idle') {
      bootstrap().catch(() => undefined);
    }
    if (status === 'authenticated') {
      router.replace(next);
    }
  }, [preview, status, bootstrap, router, next]);

  const captchaReady = !TURNSTILE_SITE_KEY || captchaToken !== null;

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await login({
        emailOrUsername: identity.trim(),
        password,
        captchaToken: captchaToken ?? undefined,
      });
      router.replace(next);
    } catch (caught) {
      if (caught instanceof TwoFactorRequiredError) {
        setTwoFactor(true);
        setSubmitting(false);
        return;
      }
      setError(
        caught instanceof CaptchaRequiredError
          ? 'Проверка Cloudflare не пройдена. Подтвердите, что вы не робот, и повторите.'
          : describeAuthError(caught, 'Не удалось войти. Попробуйте ещё раз.'),
      );
      // Токен Turnstile одноразовый — после любой попытки нужен новый.
      turnstileRef.current?.reset();
      setSubmitting(false);
    }
  };

  const invalidCredentials = error !== null;

  if (twoFactor) {
    return (
      <AuthShell
        title="Подтверждение входа"
        description="Аккаунт защищён двухфакторной аутентификацией."
      >
        <TwoFactorLoginStep
          onDone={() => router.replace(next)}
          onRestart={() => {
            setTwoFactor(false);
            setPassword('');
            turnstileRef.current?.reset();
          }}
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="С возвращением"
      description="Войдите в аккаунт twomc.su — один для сайта, магазина и серверов."
    >
      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate data-testid="login-form">
        {notice ? (
          <p role="status" className="rounded bg-success-soft px-3 py-2 text-sm text-foreground">
            {notice}
          </p>
        ) : null}
        <Field label="E-mail или ник" required>
          <Input
            name="emailOrUsername"
            autoComplete="username"
            autoFocus={!preview}
            required
            value={identity}
            invalid={invalidCredentials}
            onChange={(event) => setIdentity(event.target.value)}
          />
        </Field>
        <PasswordField
          label="Пароль"
          name="password"
          autoComplete="current-password"
          labelAddon={
            <Link
              href="/forgot-password"
              className="rounded-sm text-xs text-muted-foreground hover:text-foreground"
            >
              Забыли пароль?
            </Link>
          }
          value={password}
          invalid={invalidCredentials}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => setPassword(event.target.value)}
        />
        <Turnstile ref={turnstileRef} action="login" onToken={setCaptchaToken} />
        <p
          id={errorId}
          role="alert"
          aria-live="assertive"
          className={error ? 'text-sm text-destructive' : 'sr-only'}
        >
          {error ?? ''}
        </p>
        <Button
          type="submit"
          size="lg"
          loading={submitting || status === 'loading'}
          disabled={identity.trim() === '' || password === '' || !captchaReady}
        >
          <LogIn />
          Войти
        </Button>
      </form>
      <SocialLogin next={next} disabled={submitting} />
    </AuthShell>
  );
}
