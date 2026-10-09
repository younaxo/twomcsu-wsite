'use client';

import type { AuthUser, RegisterRequest } from '@twomc/shared';
import { UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState, type FormEvent } from 'react';
import { describeAuthError } from '@/components/auth/auth-errors';
import { AuthShell } from '@/components/auth/auth-shell';
import { PasswordField } from '@/components/auth/password-field';
import { Turnstile, type TurnstileHandle } from '@/components/auth/turnstile';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api/client';
import { TURNSTILE_SITE_KEY } from '@/lib/env';

/// Требования backend (RegisterDto): e-mail, ник 3–16 латиница/цифры/_,
/// пароль 8–72. Валидируем те же правила на клиенте — без выдуманных полей.
export const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,16}$/;

export function validateRegister(values: {
  email: string;
  username: string;
  password: string;
  confirm: string;
}): Partial<Record<'email' | 'username' | 'password' | 'confirm', string>> {
  const errors: Partial<Record<'email' | 'username' | 'password' | 'confirm', string>> = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
    errors.email = 'Введите корректный e-mail.';
  }
  if (!USERNAME_PATTERN.test(values.username)) {
    errors.username = 'Ник: 3–16 символов, латиница, цифры и подчёркивание.';
  }
  if (values.password.length < 8 || values.password.length > 72) {
    errors.password = 'Пароль: от 8 до 72 символов.';
  }
  if (values.confirm !== values.password) {
    errors.confirm = 'Пароли не совпадают.';
  }
  return errors;
}

export function RegisterForm() {
  const router = useRouter();
  const [values, setValues] = useState({ email: '', username: '', password: '', confirm: '' });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);
  const errorId = useId();

  const errors = validateRegister(values);
  const valid = Object.keys(errors).length === 0;
  const captchaReady = !TURNSTILE_SITE_KEY || captchaToken !== null;
  const update = (field: keyof typeof values) => (event: { target: { value: string } }) =>
    setValues((prev) => ({ ...prev, [field]: event.target.value }));
  const touch = (field: keyof typeof values) => () =>
    setTouched((prev) => ({ ...prev, [field]: true }));
  const shown = (field: keyof typeof values) => (touched[field] ? errors[field] : undefined);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched({ email: true, username: true, password: true, confirm: true });
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);
    const body: RegisterRequest = {
      email: values.email.trim().toLowerCase(),
      username: values.username,
      password: values.password,
      captchaToken: captchaToken ?? undefined,
    };
    try {
      await api.post<{ user: AuthUser }>('/auth/register', body, {
        auth: false,
        retryOn401: false,
      });
      // Backend не выдаёт сессию при регистрации, а вход требует свой Turnstile-токен —
      // ведём на вход с подтверждением, что аккаунт создан.
      router.replace('/login?registered=1');
    } catch (caught) {
      setError(describeAuthError(caught, 'Не удалось зарегистрироваться. Попробуйте ещё раз.'));
      // Токен Turnstile одноразовый — после любой попытки нужен новый.
      turnstileRef.current?.reset();
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Регистрация"
      description="Ник станет вашим именем на сайте; в игре используется ваш Minecraft-ник."
      footer={
        <p>
          Уже есть аккаунт?{' '}
          <Link href="/login" className="font-medium text-foreground hover:underline">
            Войти
          </Link>
        </p>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={onSubmit}
        noValidate
        data-testid="register-form"
      >
        <Field label="E-mail" required error={shown('email')}>
          <Input
            type="email"
            name="email"
            autoComplete="email"
            autoFocus
            required
            value={values.email}
            onChange={update('email')}
            onBlur={touch('email')}
          />
        </Field>
        <Field
          label="Ник"
          required
          hint="3–16 символов: латиница, цифры, подчёркивание"
          error={shown('username')}
        >
          <Input
            name="username"
            autoComplete="username"
            required
            maxLength={16}
            value={values.username}
            onChange={update('username')}
            onBlur={touch('username')}
          />
        </Field>
        <PasswordField
          label="Пароль"
          name="password"
          autoComplete="new-password"
          hint="От 8 до 72 символов"
          error={shown('password')}
          value={values.password}
          onChange={update('password')}
          onBlur={touch('password')}
        />
        <PasswordField
          label="Повторите пароль"
          name="confirm"
          autoComplete="new-password"
          error={shown('confirm')}
          value={values.confirm}
          onChange={update('confirm')}
          onBlur={touch('confirm')}
        />
        <Turnstile ref={turnstileRef} action="register" onToken={setCaptchaToken} />
        <p
          id={errorId}
          role="alert"
          aria-live="assertive"
          className={error ? 'text-sm text-destructive' : 'sr-only'}
        >
          {error ?? ''}
        </p>
        <Button type="submit" size="lg" loading={submitting} disabled={!captchaReady}>
          <UserPlus />
          Создать аккаунт
        </Button>
        <p className="text-xs text-muted-foreground">
          Регистрируясь, вы соглашаетесь с правилами проекта. Правовые документы публикуются в
          разделе «Правовая информация».
        </p>
      </form>
    </AuthShell>
  );
}
