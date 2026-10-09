'use client';

import type { ForgotPasswordRequest } from '@twomc/shared';
import { MailCheck, Send } from 'lucide-react';
import Link from 'next/link';
import { useId, useRef, useState, type FormEvent } from 'react';
import { describeAuthError } from '@/components/auth/auth-errors';
import { AuthShell } from '@/components/auth/auth-shell';
import { Turnstile, type TurnstileHandle } from '@/components/auth/turnstile';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api/client';
import { TURNSTILE_SITE_KEY } from '@/lib/env';

/// «Забыли пароль?»: e-mail + Turnstile → письмо с инструкцией. После
/// запроса показываем нейтральный ответ (есть аккаунт или нет — не раскрываем),
/// как и backend (всегда 204).
export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);
  const errorId = useId();
  const captchaReady = !TURNSTILE_SITE_KEY || captchaToken !== null;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || !emailValid) return;
    setSubmitting(true);
    setError(null);
    const body: ForgotPasswordRequest = {
      email: email.trim().toLowerCase(),
      captchaToken: captchaToken ?? undefined,
    };
    try {
      await api.post('/auth/forgot-password', body, {
        auth: false,
        retryOn401: false,
        parse: 'none',
      });
      setSent(true);
    } catch (caught) {
      setError(describeAuthError(caught, 'Не удалось отправить инструкцию. Попробуйте ещё раз.'));
      turnstileRef.current?.reset();
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <AuthShell
        title="Проверьте почту"
        footer={
          <Link href="/login" className="hover:text-foreground">
            Вернуться ко входу
          </Link>
        }
      >
        <div className="flex flex-col items-center gap-3 text-center" data-testid="forgot-sent">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary-soft-foreground">
            <MailCheck aria-hidden className="size-6" />
          </span>
          <p className="text-sm text-muted-foreground">
            Если на этот e-mail зарегистрирован аккаунт twomc.su, мы отправили письмо с инструкцией
            по восстановлению пароля. Ссылка действует ограниченное время.
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Забыли пароль?"
      description="Укажите e-mail аккаунта — пришлём ссылку для сброса пароля."
      footer={
        <Link href="/login" className="hover:text-foreground">
          Вернуться ко входу
        </Link>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={onSubmit}
        noValidate
        data-testid="forgot-form"
      >
        <Field label="E-mail" required>
          <Input
            type="email"
            name="email"
            autoComplete="email"
            autoFocus
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
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
          disabled={!emailValid || !captchaReady}
        >
          <Send />
          Отправить инструкцию
        </Button>
      </form>
    </AuthShell>
  );
}
