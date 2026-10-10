'use client';

import type { ForgotLookupResponse, ForgotPasswordRequest } from '@twomc/shared';
import { ArrowLeft, MailCheck, Search, Send } from 'lucide-react';
import Link from 'next/link';
import { useId, useRef, useState, type FormEvent } from 'react';
import { describeAuthError } from '@/components/auth/auth-errors';
import { AuthShell } from '@/components/auth/auth-shell';
import { Turnstile, type TurnstileHandle } from '@/components/auth/turnstile';
import { BrandIcon } from '@/components/shell/brand-icon';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Tooltip } from '@/components/ui/tooltip';
import { api } from '@/lib/api/client';
import { TURNSTILE_SITE_KEY } from '@/lib/env';

/// «Забыли пароль?» (A13/A14/A16): по e-mail или по нику. Ответы
/// нейтральные: есть аккаунт или нет — не раскрываем; по нику показываем
/// только маску адреса (её строит сервер), полный e-mail человек вводит сам.
/// Восстановление через Discord/Telegram — пока только недоступные плитки и
/// только для привязанных провайдеров.

type Mode = 'email' | 'username';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PROVIDER_LABEL = { discord: 'Discord', telegram: 'Telegram' } as const;

/// «← Вернуться ко входу»: стрелка из icon system, лёгкий сдвиг на hover и
/// фокусе (без движения при reduced-motion).
export function BackToLogin() {
  return (
    <Link
      href="/login"
      className="group inline-flex items-center gap-1.5 rounded-sm hover:text-foreground focus-visible:text-foreground"
      data-testid="back-to-login"
    >
      <ArrowLeft
        aria-hidden
        className="size-4 transition-transform duration-fast group-hover:-translate-x-0.5 group-focus-visible:-translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
      />
      Вернуться ко входу
    </Link>
  );
}

/// Плитки восстановления через привязанные провайдеры — пока недоступны.
export function RecoveryProviders({ providers }: { providers: ForgotLookupResponse['providers'] }) {
  if (providers.length === 0) return null;
  return (
    <div className="flex flex-col gap-2" data-testid="recovery-providers">
      <p className="text-xs text-muted-foreground">Другие способы восстановления</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {providers.map((provider) => (
          <Tooltip key={provider} content="Способ восстановления пока недоступен">
            <button
              type="button"
              aria-disabled
              data-provider={provider}
              onClick={(event) => event.preventDefault()}
              className="flex cursor-not-allowed items-center gap-2 rounded-lg bg-surface-sunken px-3 py-2.5 text-left text-sm opacity-60"
            >
              <BrandIcon id={provider} className="text-muted-foreground" />
              <span className="flex-1">Сброс через {PROVIDER_LABEL[provider]}</span>
              <span className="text-xs text-subtle-foreground">Скоро</span>
            </button>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}

export function ForgotPasswordForm() {
  const [mode, setMode] = useState<Mode>('email');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [lookup, setLookup] = useState<ForgotLookupResponse | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);
  const errorId = useId();
  const captchaReady = !TURNSTILE_SITE_KEY || captchaToken !== null;
  const emailValid = EMAIL_RE.test(email.trim());
  const usernameValid = /^[A-Za-z0-9_]{3,32}$/.test(username.trim());
  const found = mode === 'username' && !!lookup?.maskedEmail;

  // Токен Turnstile одноразовый: после каждого запроса — новый.
  const resetCaptcha = () => {
    setCaptchaToken(null);
    turnstileRef.current?.reset();
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setLookup(null);
    setError(null);
  };

  const sendReset = async () => {
    const body: ForgotPasswordRequest = {
      email: email.trim().toLowerCase(),
      captchaToken: captchaToken ?? undefined,
      ...(mode === 'username' ? { username: username.trim() } : {}),
    };
    await api.post('/auth/forgot-password', body, {
      auth: false,
      retryOn401: false,
      parse: 'none',
    });
    setSent(true);
  };

  const findAccount = async () => {
    const result = await api.post<ForgotLookupResponse>(
      '/auth/forgot-password/lookup',
      { username: username.trim(), captchaToken: captchaToken ?? undefined },
      { auth: false, retryOn401: false },
    );
    resetCaptcha();
    setSubmitting(false);
    if (!result.maskedEmail) {
      setError('Аккаунт с таким ником не найден. Проверьте ник или восстановите пароль по e-mail.');
      return;
    }
    setLookup(result);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    if (mode === 'username' && !found ? !usernameValid : !emailValid) return;
    setSubmitting(true);
    setError(null);
    try {
      if (mode === 'username' && !found) await findAccount();
      else await sendReset();
    } catch (caught) {
      setError(describeAuthError(caught, 'Не удалось выполнить запрос. Попробуйте ещё раз.'));
      resetCaptcha();
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <AuthShell title="Проверьте почту" footer={<BackToLogin />}>
        <div className="flex flex-col items-center gap-3 text-center" data-testid="forgot-sent">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary-soft-foreground">
            <MailCheck aria-hidden className="size-6" />
          </span>
          <p className="text-sm text-muted-foreground">
            {mode === 'username'
              ? 'Если адрес совпал с почтой этого аккаунта, мы отправили письмо со ссылкой для сброса пароля. Ссылка действует ограниченное время.'
              : 'Если на этот e-mail зарегистрирован аккаунт twomc.su, мы отправили письмо с инструкцией по восстановлению пароля. Ссылка действует ограниченное время.'}
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Забыли пароль?"
      description={
        mode === 'email'
          ? 'Укажите e-mail аккаунта — пришлём ссылку для сброса пароля.'
          : 'Не помните почту? Найдите аккаунт по нику — покажем подсказку адреса.'
      }
      footer={<BackToLogin />}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={onSubmit}
        noValidate
        data-testid="forgot-form"
      >
        <SegmentedControl
          aria-label="Способ восстановления"
          value={mode}
          onValueChange={(value) => switchMode(value as Mode)}
          options={[
            { value: 'email', label: 'По e-mail' },
            { value: 'username', label: 'По нику' },
          ]}
        />
        {mode === 'username' ? (
          <Field label="Ник" required>
            <Input
              name="username"
              autoComplete="username"
              autoFocus
              required
              spellCheck={false}
              value={username}
              disabled={found}
              onChange={(event) => {
                setUsername(event.target.value);
                setLookup(null);
              }}
            />
          </Field>
        ) : null}
        {found ? (
          <div className="flex flex-col gap-1 rounded-lg bg-surface-sunken px-3 py-2.5" data-testid="masked-email">
            <span className="text-xs text-muted-foreground">Почта аккаунта</span>
            <span className="font-mono text-sm">{lookup!.maskedEmail}</span>
            <button
              type="button"
              className="self-start text-xs text-primary hover:underline"
              onClick={() => switchMode('username')}
            >
              Другой ник
            </button>
          </div>
        ) : null}
        {mode === 'email' || found ? (
          <Field
            label="E-mail"
            hint={
              found
                ? 'Введите полный адрес электронной почты, привязанный к этому аккаунту.'
                : undefined
            }
            required
          >
            <Input
              type="email"
              name="email"
              autoComplete="email"
              autoFocus={mode === 'email' || found}
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
        ) : null}
        {found ? <RecoveryProviders providers={lookup!.providers} /> : null}
        <Turnstile ref={turnstileRef} action="forgot-password" onToken={setCaptchaToken} />
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
          loading={submitting}
          disabled={
            !captchaReady || (mode === 'username' && !found ? !usernameValid : !emailValid)
          }
        >
          {mode === 'username' && !found ? <Search /> : <Send />}
          {mode === 'username' && !found ? 'Найти аккаунт' : 'Отправить ссылку'}
        </Button>
      </form>
    </AuthShell>
  );
}
