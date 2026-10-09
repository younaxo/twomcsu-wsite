'use client';

import type { ResetPasswordRequest } from '@twomc/shared';
import { KeyRound, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useId, useRef, useState, type FormEvent } from 'react';
import { describeAuthError } from '@/components/auth/auth-errors';
import { AuthShell } from '@/components/auth/auth-shell';
import { PasswordField } from '@/components/auth/password-field';
import { Turnstile, type TurnstileHandle } from '@/components/auth/turnstile';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { TURNSTILE_SITE_KEY } from '@/lib/env';

/// Токен из письма — hex-строка; пустой/битый — сразу честная ошибка,
/// без запроса. Срок действия и одноразовость проверяет backend.
export function isTokenShapeValid(token: string | null): token is string {
  return !!token && /^[a-f0-9]{32,128}$/i.test(token);
}

export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);
  const errorId = useId();

  const passwordError =
    password.length < 8 || password.length > 72 ? 'Пароль: от 8 до 72 символов.' : undefined;
  const confirmError = confirm !== password ? 'Пароли не совпадают.' : undefined;
  const valid = !passwordError && !confirmError;
  const captchaReady = !TURNSTILE_SITE_KEY || captchaToken !== null;

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched(true);
    if (!valid || submitting || !isTokenShapeValid(token)) return;
    setSubmitting(true);
    setError(null);
    const body: ResetPasswordRequest = {
      token,
      password,
      captchaToken: captchaToken ?? undefined,
    };
    try {
      await api.post('/auth/reset-password', body, {
        auth: false,
        retryOn401: false,
        parse: 'none',
      });
      setDone(true);
    } catch (caught) {
      if (caught instanceof ApiError && (caught.status === 400 || caught.status === 404)) {
        setError(
          'Ссылка недействительна или устарела. Запросите новую на странице «Забыли пароль?».',
        );
      } else {
        setError(describeAuthError(caught, 'Не удалось сменить пароль. Попробуйте ещё раз.'));
      }
      turnstileRef.current?.reset();
      setSubmitting(false);
    }
  };

  if (!isTokenShapeValid(token)) {
    return (
      <AuthShell
        title="Ссылка недействительна"
        description="В адресе нет корректного токена восстановления."
        footer={
          <Link href="/forgot-password" className="hover:text-foreground">
            Запросить новую ссылку
          </Link>
        }
      >
        <p className="text-sm text-muted-foreground" data-testid="reset-invalid-token">
          Откройте ссылку из письма целиком или запросите восстановление пароля заново.
        </p>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell
        title="Пароль изменён"
        footer={
          <Link href="/login" className="font-medium text-foreground hover:underline">
            Войти с новым паролем
          </Link>
        }
      >
        <div className="flex flex-col items-center gap-3 text-center" data-testid="reset-done">
          <span className="flex size-12 items-center justify-center rounded-full bg-success-soft text-success">
            <ShieldCheck aria-hidden className="size-6" />
          </span>
          <p className="text-sm text-muted-foreground">
            Все активные сессии завершены — войдите заново с новым паролем.
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Новый пароль" description="Придумайте новый пароль для аккаунта twomc.su.">
      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate data-testid="reset-form">
        <PasswordField
          label="Новый пароль"
          name="password"
          autoComplete="new-password"
          autoFocus
          hint="От 8 до 72 символов"
          error={touched ? passwordError : undefined}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <PasswordField
          label="Подтверждение"
          name="confirm"
          autoComplete="new-password"
          error={touched ? confirmError : undefined}
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />
        <Turnstile ref={turnstileRef} action="reset-password" onToken={setCaptchaToken} />
        <p
          id={errorId}
          role="alert"
          aria-live="assertive"
          className={error ? 'text-sm text-destructive' : 'sr-only'}
        >
          {error ?? ''}
        </p>
        <Button type="submit" size="lg" loading={submitting} disabled={!captchaReady}>
          <KeyRound />
          Сменить пароль
        </Button>
      </form>
    </AuthShell>
  );
}
