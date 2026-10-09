'use client';

import { Eye, EyeOff, LogIn } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { Button, IconButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { ApiError, NetworkError } from '@/lib/api/errors';
import { CaptchaRequiredError, useAuthStore } from '@/lib/auth/store';

/// Куда вести после входа: только внутренние пути (без `//evil.com`).
function safeNext(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/admin';
  }
  return value;
}

function describeError(error: unknown): string {
  if (error instanceof CaptchaRequiredError) {
    return error.message;
  }
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return 'Неверный логин или пароль.';
    }
    if (error.status === 403) {
      return error.message || 'Вход для этого аккаунта запрещён.';
    }
    if (error.status === 429) {
      return 'Слишком много попыток. Подождите немного и попробуйте снова.';
    }
    return error.message;
  }
  if (error instanceof NetworkError) {
    return 'Сервер недоступен. Проверьте подключение и попробуйте ещё раз.';
  }
  return 'Не удалось войти. Попробуйте ещё раз.';
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get('next'));
  const status = useAuthStore((state) => state.status);
  const bootstrap = useAuthStore((state) => state.bootstrap);
  const login = useAuthStore((state) => state.login);

  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  // Уже вошли (refresh-cookie жив) — сразу дальше.
  useEffect(() => {
    if (status === 'idle') {
      bootstrap().catch(() => undefined);
    }
    if (status === 'authenticated') {
      router.replace(next);
    }
  }, [status, bootstrap, router, next]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await login({ emailOrUsername: identity.trim(), password });
      router.replace(next);
    } catch (caught) {
      setError(describeError(caught));
      setSubmitting(false);
    }
  };

  const invalidCredentials = error !== null;

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="flex items-center justify-between px-4 py-3 md:px-6">
        <p className="font-display text-xl font-bold tracking-tight">twomc.su</p>
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <Card className="w-full max-w-sm">
          <h1 className="text-2xl">Вход</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Аккаунт сайта twomc.su. Доступ в админ-панель — по правам роли.
          </p>
          <form className="mt-6 flex flex-col gap-4" onSubmit={onSubmit} noValidate>
            <Field label="E-mail или ник" required>
              <Input
                name="emailOrUsername"
                autoComplete="username"
                autoFocus
                required
                value={identity}
                invalid={invalidCredentials}
                onChange={(event) => setIdentity(event.target.value)}
              />
            </Field>
            <Field label="Пароль" required>
              <Input
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                invalid={invalidCredentials}
                aria-describedby={error ? errorId : undefined}
                onChange={(event) => setPassword(event.target.value)}
                trailing={
                  <IconButton
                    type="button"
                    size="sm"
                    aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((value) => !value)}
                  >
                    {showPassword ? <EyeOff /> : <Eye />}
                  </IconButton>
                }
              />
            </Field>
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
              disabled={identity.trim() === '' || password === ''}
            >
              <LogIn />
              Войти
            </Button>
          </form>
        </Card>
      </main>
    </div>
  );
}
