'use client';

import { KeyRound, ShieldCheck } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { OtpInput } from '@/components/ui/otp-input';
import { ApiError, getErrorMessage } from '@/lib/api/errors';
import { useAuthStore } from '@/lib/auth/store';

/// Второй шаг входа при включённой 2FA (ADR-0109): 6 цифр из приложения или
/// резервный код. Челлендж — в httpOnly cookie (после пароля или внешнего
/// аккаунта), здесь только код. Истёк / сгорел (5 неверных) — «Войти заново».

type Failure = { text: string; restart: boolean };

function describe(error: unknown): Failure {
  if (error instanceof ApiError) {
    if (error.code === 'two_factor_expired' || error.code === 'two_factor_locked') {
      return { text: error.message, restart: true };
    }
    if (error.code === 'two_factor_invalid') {
      const left = (error.body as { attemptsLeft?: number } | null)?.attemptsLeft;
      return {
        text:
          typeof left === 'number' ? `Неверный код. Осталось попыток: ${left}.` : 'Неверный код.',
        restart: false,
      };
    }
  }
  return { text: getErrorMessage(error), restart: false };
}

export function TwoFactorLoginStep({
  onDone,
  onRestart,
}: {
  onDone: () => void;
  onRestart: () => void;
}) {
  const completeTwoFactor = useAuthStore((state) => state.completeTwoFactor);
  const [mode, setMode] = useState<'totp' | 'backup'>('totp');
  const [code, setCode] = useState('');
  const [backup, setBackup] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const errorId = useId();

  const submit = async (value: string) => {
    if (submitting || value.trim() === '') return;
    setSubmitting(true);
    setFailure(null);
    try {
      await completeTwoFactor(value.trim());
      onDone();
    } catch (error) {
      setFailure(describe(error));
      setCode('');
      setSubmitting(false);
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submit(mode === 'totp' ? code : backup);
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={onSubmit}
      noValidate
      data-testid="two-factor-step"
    >
      {mode === 'totp' ? (
        <Field
          label="Код из приложения"
          hint="Откройте приложение-аутентификатор и введите 6 цифр для twomc.su."
        >
          <OtpInput
            length={6}
            value={code}
            onChange={setCode}
            onComplete={(value) => void submit(value)}
            invalid={failure !== null}
            loading={submitting}
            autoFocus
            aria-describedby={failure ? errorId : undefined}
          />
        </Field>
      ) : (
        <Field
          label="Резервный код"
          hint="Один из кодов, сохранённых при включении 2FA. Каждый — один раз."
        >
          <Input
            value={backup}
            autoFocus
            autoComplete="one-time-code"
            spellCheck={false}
            placeholder="xxxx-xxxx"
            invalid={failure !== null}
            onChange={(event) => setBackup(event.target.value)}
          />
        </Field>
      )}
      <p
        id={errorId}
        role="alert"
        aria-live="assertive"
        className={failure ? 'text-sm text-destructive' : 'sr-only'}
      >
        {failure?.text ?? ''}
      </p>
      {failure?.restart ? (
        <Button type="button" size="lg" onClick={onRestart}>
          Войти заново
        </Button>
      ) : (
        <Button
          type="submit"
          size="lg"
          loading={submitting}
          disabled={mode === 'totp' ? code.length !== 6 : backup.trim() === ''}
        >
          <ShieldCheck />
          Подтвердить вход
        </Button>
      )}
      <Button
        type="button"
        variant="ghost"
        onClick={() => {
          setMode(mode === 'totp' ? 'backup' : 'totp');
          setFailure(null);
        }}
      >
        <KeyRound />
        {mode === 'totp' ? 'Использовать резервный код' : 'Ввести код из приложения'}
      </Button>
    </form>
  );
}
