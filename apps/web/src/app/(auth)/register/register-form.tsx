'use client';

import type {
  LoginResponse,
  RegisterStateResponse,
  RegisterCompleteRequest,
  RegisterStartRequest,
  RegisterVerificationState,
  RegisterVerifyResponse,
} from '@twomc/shared';
import {
  CircleCheck,
  Clock,
  FileText,
  MailCheck,
  Pencil,
  RotateCw,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { describeAuthError } from '@/components/auth/auth-errors';
import { AuthShell } from '@/components/auth/auth-shell';
import { PasswordField } from '@/components/auth/password-field';
import { Turnstile, type TurnstileHandle } from '@/components/auth/turnstile';
import { Button } from '@/components/ui/button';
import { CheckboxField } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { OtpInput } from '@/components/ui/otp-input';
import { MinecraftLinkStep } from '@/components/auth/minecraft-link-step';
import { api } from '@/lib/api/client';
import { cn } from '@/lib/cn';
import { ApiError } from '@/lib/api/errors';
import { useAuthStore } from '@/lib/auth/store';
import { TURNSTILE_SITE_KEY } from '@/lib/env';

/// Регистрация с подтверждением почты (ADR-0070):
///   1) данные + реферальный код + Turnstile + два отдельных согласия →
///      «Подтвердить почту» (backend отправляет 6-значный код);
///   2) на этой же странице — ввод кода (вставка, автофокус, Backspace,
///      цифровая клавиатура), «Отправить повторно» с таймером, «Изменить E-mail»;
///   3) только после верного кода — «Создать аккаунт».
/// Пароль хранится только в памяти этой формы: не в URL, storage или логах.

export const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,16}$/;
export const REFERRAL_PATTERN = /^[A-Za-z0-9_]{3,24}$/;

type Fields = 'email' | 'username' | 'password' | 'confirm' | 'referral';

export function validateRegister(values: {
  email: string;
  username: string;
  password: string;
  confirm: string;
  referral?: string;
}): Partial<Record<Fields, string>> {
  const errors: Partial<Record<Fields, string>> = {};
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
  if (values.referral && !REFERRAL_PATTERN.test(values.referral.trim())) {
    errors.referral = 'Код: 3–24 символа, латиница, цифры и подчёркивание.';
  }
  return errors;
}

function apiCode(error: unknown): string | null {
  if (error instanceof ApiError && error.body && typeof error.body === 'object') {
    const body = error.body as { code?: unknown; message?: unknown };
    if (typeof body.code === 'string') return body.code;
    if (body.message && typeof body.message === 'object') {
      const nested = (body.message as { code?: unknown }).code;
      if (typeof nested === 'string') return nested;
    }
  }
  return null;
}

const OTP_MESSAGES: Record<string, string> = {
  otp_expired: 'Срок действия кода истёк — отправьте новый.',
  otp_attempts: 'Слишком много неверных попыток — отправьте новый код.',
  otp_cooldown: 'Повторно отправить код можно чуть позже.',
  otp_send_limit: 'Лимит отправок исчерпан — измените e-mail или начните заново.',
  otp_rate_limited: 'Слишком много запросов кода на этот e-mail. Попробуйте позже.',
  otp_not_found: 'Запрос подтверждения устарел — начните заново.',
  completion_invalid: 'Подтверждение почты устарело — пройдите его заново.',
  referral_invalid: 'Реферальный код не найден.',
  email_taken: 'Этот e-mail уже зарегистрирован.',
  username_taken: 'Этот ник уже занят.',
  mail_failed: 'Не удалось отправить письмо с кодом. Попробуйте позже.',
  registration_closed: 'Регистрация временно закрыта.',
  captcha_failed: 'Проверка Cloudflare не пройдена. Повторите.',
};

function describe(error: unknown, fallback: string): string {
  const code = apiCode(error);
  if (code && OTP_MESSAGES[code]) return OTP_MESSAGES[code];
  return describeAuthError(error, fallback);
}

function useCountdown(target: string | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [target]);
  return target ? Math.max(0, Math.ceil((new Date(target).getTime() - now) / 1000)) : 0;
}

type Step = 'details' | 'code' | 'minecraft' | 'create';

/// Продолжение регистрации после перезагрузки: в sessionStorage — только
/// идентификатор запроса и токен завершения (НЕ пароль); стадию знает backend.
const RESUME_KEY = 'twomc.registration';

interface ResumeData {
  verificationId: string;
  completionToken?: string;
}

function readResume(): ResumeData | null {
  try {
    const raw = window.sessionStorage.getItem(RESUME_KEY);
    const data = raw ? (JSON.parse(raw) as ResumeData) : null;
    return data && typeof data.verificationId === 'string' ? data : null;
  } catch {
    return null;
  }
}

function writeResume(data: ResumeData | null) {
  try {
    if (data) window.sessionStorage.setItem(RESUME_KEY, JSON.stringify(data));
    else window.sessionStorage.removeItem(RESUME_KEY);
  } catch {
    // Хранилище недоступно — продолжение после перезагрузки просто не сработает.
  }
}

/// Состояние «код отправлен» для превью в design-lab (письмо не отправляется).
function previewVerification(): RegisterVerificationState {
  return {
    verificationId: 'design-lab-preview',
    maskedEmail: 'pl***@twomc.su',
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    resendAvailableAt: new Date(Date.now() + 31_000).toISOString(),
    resendsLeft: 4,
  };
}

export function RegisterForm({
  previewStep,
}: { previewStep?: 'code' | 'minecraft' | 'create' } = {}) {
  const router = useRouter();
  const acceptSession = useAuthStore((state) => state.acceptSession);
  const preview = previewStep !== undefined;
  const [values, setValues] = useState(() => ({
    email: preview ? 'player@twomc.su' : '',
    username: preview ? 'player' : '',
    password: preview ? 'design-lab-pass' : '',
    confirm: preview ? 'design-lab-pass' : '',
    referral: '',
  }));
  const [consents, setConsents] = useState({ terms: preview, personalData: preview });
  const [touched, setTouched] = useState<Partial<Record<Fields | 'consents', boolean>>>({});
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [step, setStep] = useState<Step>(previewStep ?? 'details');
  const [verification, setVerification] = useState<RegisterVerificationState | null>(() =>
    preview ? previewVerification() : null,
  );
  const [completionToken, setCompletionToken] = useState<string | null>(() =>
    preview ? 'design-lab-preview-token-0000000000000000000000000000' : null,
  );
  const [minecraftRequired, setMinecraftRequired] = useState(preview);
  /// Пароль потерян при перезагрузке — на последнем шаге его вводят снова.
  const [needPassword, setNeedPassword] = useState(false);
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);
  const errorId = useId();
  const otpLabelId = useId();
  const consentsHintId = useId();
  const emailRef = useRef<HTMLInputElement>(null);
  const resendIn = useCountdown(verification?.resendAvailableAt ?? null);

  // Продолжение после перезагрузки страницы (стадия — с сервера).
  useEffect(() => {
    if (preview) return;
    const saved = readResume();
    if (!saved) return;
    let cancelled = false;
    api
      .post<RegisterStateResponse>('/auth/register/state', saved, {
        auth: false,
        retryOn401: false,
      })
      .then((state) => {
        if (cancelled) return;
        setVerification(state);
        setMinecraftRequired(state.minecraft.required);
        setValues((prev) => ({ ...prev, email: state.maskedEmail, username: state.username }));
        setConsents({ terms: true, personalData: true });
        if (state.stage === 'email') {
          setStep('code');
          return;
        }
        setCompletionToken(saved.completionToken ?? null);
        setNeedPassword(true);
        setStep(state.stage === 'minecraft' ? 'minecraft' : 'create');
      })
      .catch(() => writeResume(null));
    return () => {
      cancelled = true;
    };
  }, [preview]);

  const errors = validateRegister(values);
  const consentsOk = consents.terms && consents.personalData;
  const valid = Object.keys(errors).length === 0 && consentsOk;
  const captchaReady = !TURNSTILE_SITE_KEY || captchaToken !== null;
  const update = (field: Fields) => (event: { target: { value: string } }) =>
    setValues((prev) => ({ ...prev, [field]: event.target.value }));
  const touch = (field: Fields) => () => setTouched((prev) => ({ ...prev, [field]: true }));
  const shown = (field: Fields) => (touched[field] ? errors[field] : undefined);

  const startVerification = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched({
      email: true,
      username: true,
      password: true,
      confirm: true,
      referral: true,
      consents: true,
    });
    if (!valid || pending) return;
    setPending(true);
    setError(null);
    const body: RegisterStartRequest = {
      email: values.email.trim().toLowerCase(),
      username: values.username,
      referralCode: values.referral.trim() ? values.referral.trim().toUpperCase() : undefined,
      acceptTerms: consents.terms,
      acceptPersonalData: consents.personalData,
      captchaToken: captchaToken ?? undefined,
    };
    try {
      const state = await api.post<RegisterVerificationState>('/auth/register/start', body, {
        auth: false,
        retryOn401: false,
      });
      setVerification(state);
      setMinecraftRequired(state.minecraftRequired === true);
      writeResume({ verificationId: state.verificationId });
      setCode('');
      setStep('code');
    } catch (caught) {
      setError(describe(caught, 'Не удалось отправить код. Попробуйте ещё раз.'));
    } finally {
      turnstileRef.current?.reset();
      setPending(false);
    }
  };

  const verifyCode = async (value = code) => {
    if (!verification || value.length !== 6 || pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await api.post<RegisterVerifyResponse>(
        '/auth/register/verify',
        { verificationId: verification.verificationId, code: value },
        { auth: false, retryOn401: false },
      );
      setCompletionToken(result.completionToken);
      writeResume({
        verificationId: verification.verificationId,
        completionToken: result.completionToken,
      });
      setStep(result.minecraftRequired ? 'minecraft' : 'create');
    } catch (caught) {
      const apiErr = caught instanceof ApiError ? caught : null;
      const body = apiErr?.body as { attemptsLeft?: number; message?: { attemptsLeft?: number } };
      const left = body?.attemptsLeft ?? body?.message?.attemptsLeft;
      setError(
        apiCode(caught) === 'otp_invalid'
          ? `Неверный код${typeof left === 'number' ? `. Осталось попыток: ${left}` : ''}.`
          : describe(caught, 'Не удалось проверить код.'),
      );
      setCode('');
    } finally {
      setPending(false);
    }
  };

  const resend = async () => {
    if (!verification || resendIn > 0 || pending) return;
    setPending(true);
    setError(null);
    try {
      const state = await api.post<RegisterVerificationState>(
        '/auth/register/resend',
        { verificationId: verification.verificationId },
        { auth: false, retryOn401: false },
      );
      setVerification(state);
      setCode('');
    } catch (caught) {
      setError(describe(caught, 'Не удалось отправить код повторно.'));
    } finally {
      setPending(false);
    }
  };

  const changeEmail = () => {
    setStep('details');
    setVerification(null);
    setCompletionToken(null);
    setNeedPassword(false);
    writeResume(null);
    setCode('');
    setError(null);
    // Поля снова доступны — фокус в e-mail после перерисовки.
    window.requestAnimationFrame(() => emailRef.current?.focus());
  };

  const createAccount = async () => {
    if (!verification || !completionToken || pending) return;
    if (needPassword && (errors.password || errors.confirm)) {
      setTouched((prev) => ({ ...prev, password: true, confirm: true }));
      return;
    }
    setPending(true);
    setError(null);
    const body: RegisterCompleteRequest = {
      verificationId: verification.verificationId,
      completionToken,
      password: values.password,
    };
    try {
      const session = await api.post<LoginResponse>('/auth/register/complete', body, {
        auth: false,
        retryOn401: false,
      });
      writeResume(null);
      await acceptSession(session.accessToken);
      router.replace('/');
    } catch (caught) {
      setError(describe(caught, 'Не удалось создать аккаунт.'));
      setPending(false);
    }
  };

  const errorBlock = (
    <p
      id={errorId}
      role="alert"
      aria-live="assertive"
      className={error ? 'text-sm text-destructive' : 'sr-only'}
    >
      {error ?? ''}
    </p>
  );

  /// После «Подтвердить почту» данные остаются видны, но заблокированы:
  /// изменить их можно только через «Изменить E-mail».
  const locked = step !== 'details';
  /// После перезагрузки пароль вводится заново на последнем шаге.
  const passwordLocked = locked && !(step === 'create' && needPassword);
  const totalSteps = minecraftRequired ? 4 : 3;
  const requirement = 'text-xs text-subtle-foreground';
  const consentRow = 'min-h-0 py-1.5';
  const legalLink =
    'text-foreground underline decoration-border-strong underline-offset-2 hover:decoration-foreground';

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (step === 'details') {
      void startVerification(event);
      return;
    }
    event.preventDefault();
    if (step === 'code') {
      void verifyCode();
    } else if (step === 'create') {
      void createAccount();
    }
  };

  return (
    <AuthShell
      title={
        step === 'create'
          ? 'Почти готово'
          : step === 'minecraft'
            ? 'Подтвердите Minecraft'
            : 'Создайте аккаунт'
      }
      description={
        step === 'details'
          ? 'Один аккаунт для сайта, магазина и серверов twomc.su.'
          : step === 'code'
            ? `Шаг 2 из ${totalSteps} — введите код из письма.`
            : step === 'minecraft'
              ? `Шаг 3 из ${totalSteps} — привяжите игровой аккаунт.`
              : `Шаг ${totalSteps} из ${totalSteps} — осталось создать аккаунт.`
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={onSubmit}
        noValidate
        data-testid="register-form"
        data-step={step}
      >
        {/* items-start: подсказки/ошибки одного поля не растягивают соседнее. */}
        <div className="grid items-start gap-x-4 gap-y-3 sm:grid-cols-2">
          <Field label="E-mail" required error={shown('email')}>
            <Input
              ref={emailRef}
              type="email"
              name="email"
              autoComplete="email"
              autoFocus={!preview}
              disabled={locked}
              value={values.email}
              invalid={!!shown('email')}
              onChange={update('email')}
              onBlur={touch('email')}
            />
          </Field>
          <Field
            label="Ник"
            required
            labelAddon={<span className={requirement}>3–16 · a–z 0–9 _</span>}
            error={shown('username')}
          >
            <Input
              name="username"
              autoComplete="username"
              disabled={locked}
              value={values.username}
              invalid={!!shown('username')}
              onChange={update('username')}
              onBlur={touch('username')}
            />
          </Field>
          <PasswordField
            label="Пароль"
            name="password"
            autoComplete="new-password"
            labelAddon={<span className={requirement}>8–72 символа</span>}
            disabled={passwordLocked}
            value={values.password}
            error={shown('password')}
            onChange={update('password')}
            onBlur={touch('password')}
          />
          <PasswordField
            label="Повторите пароль"
            name="confirm"
            autoComplete="new-password"
            disabled={passwordLocked}
            value={values.confirm}
            error={shown('confirm')}
            onChange={update('confirm')}
            onBlur={touch('confirm')}
          />
          <Field
            label="Реферальный код"
            labelAddon={<span className={requirement}>Необязательно</span>}
            error={shown('referral')}
          >
            <Input
              name="referral"
              autoComplete="off"
              spellCheck={false}
              placeholder="Введите код"
              className="font-mono uppercase tracking-wider placeholder:font-sans placeholder:normal-case placeholder:tracking-normal"
              disabled={locked}
              value={values.referral}
              invalid={!!shown('referral')}
              onChange={(event) =>
                setValues((prev) => ({ ...prev, referral: event.target.value.toUpperCase() }))
              }
              onBlur={touch('referral')}
            />
          </Field>
        </div>

        {step === 'details' ? (
          <Turnstile ref={turnstileRef} action="register" onToken={setCaptchaToken} />
        ) : null}

        {/* Legal-блок (ADR-0087): два обязательных согласия + информационная
            строка о политике конфиденциальности — одна группа на общей
            поверхности; строка политики отделена тонкой линией и без чекбокса,
            чтобы не читаться третьим согласием. */}
        <fieldset
          className="flex flex-col rounded-lg bg-surface-sunken px-3 py-2"
          aria-label="Согласия"
          disabled={locked}
          data-testid="legal-block"
        >
          <CheckboxField
            checked={consents.terms}
            disabled={locked}
            onCheckedChange={(value) => setConsents((c) => ({ ...c, terms: value === true }))}
            invalid={touched.consents && !consents.terms}
            wrapperClassName={consentRow}
            data-testid="consent-terms"
            label={
              <span className="text-muted-foreground">
                Я принимаю{' '}
                <Link href="/legal/terms" className={legalLink} target="_blank">
                  Пользовательское соглашение
                </Link>{' '}
                и{' '}
                <Link href="/rules" className={legalLink} target="_blank">
                  Правила проекта
                </Link>
              </span>
            }
          />
          <CheckboxField
            checked={consents.personalData}
            disabled={locked}
            onCheckedChange={(value) =>
              setConsents((c) => ({ ...c, personalData: value === true }))
            }
            invalid={touched.consents && !consents.personalData}
            wrapperClassName={consentRow}
            data-testid="consent-personal-data"
            label={
              <span className="text-muted-foreground">
                Я даю{' '}
                <Link href="/legal/personal-data" className={legalLink} target="_blank">
                  согласие на обработку персональных данных
                </Link>
              </span>
            }
          />
          {/* Информационная строка той же группы: не согласие — поэтому без чекбокса,
              на его месте иконка; шрифт и отступы как у согласий. */}
          <p
            className="mt-1 flex items-start gap-3 border-t border-border-subtle pb-1 pt-2.5 text-sm font-medium leading-5"
            data-testid="privacy-row"
          >
            <span aria-hidden className="mt-0.5 flex size-5 shrink-0 items-center justify-center">
              <FileText className="size-4 text-subtle-foreground" />
            </span>
            <span className="text-muted-foreground">
              Как мы обрабатываем данные —{' '}
              <Link href="/legal/privacy" className={legalLink} target="_blank">
                Политика конфиденциальности
              </Link>
            </span>
          </p>
        </fieldset>
        {step === 'details' && !consentsOk ? (
          <p
            id={consentsHintId}
            className={cn(
              '-mt-2 text-xs',
              touched.consents ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            Оба согласия обязательны — отметьте их, чтобы продолжить.
          </p>
        ) : null}

        {step === 'code' && verification ? (
          <section
            aria-labelledby={otpLabelId}
            className="flex flex-col gap-3 border-t border-border-subtle pt-5"
            data-testid="otp-step"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id={otpLabelId} className="text-[13px] font-medium text-foreground/90">
                Код подтверждения
              </h2>
              <Button variant="ghost" size="sm" onClick={changeEmail}>
                <Pencil />
                Изменить E-mail
              </Button>
            </div>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              Код отправлен на{' '}
              <span className="font-medium text-foreground">{verification.maskedEmail}</span>. Он
              действует 10 минут.
            </p>
            <OtpInput
              autoFocus={!preview}
              size="lg"
              value={code}
              onChange={(next) => {
                setCode(next);
                // Новый ввод после ошибки — снимаем подсветку и сообщение.
                if (next && error) {
                  setError(null);
                }
              }}
              onComplete={(value) => void verifyCode(value)}
              invalid={!!error}
              loading={pending}
              aria-describedby={error ? errorId : undefined}
            />
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => void resend()}
              disabled={resendIn > 0 || pending || verification.resendsLeft === 0}
              data-testid="otp-resend"
            >
              {resendIn > 0 ? <Clock /> : <RotateCw />}
              {verification.resendsLeft === 0
                ? 'Лимит отправок исчерпан'
                : resendIn > 0
                  ? `Отправить повторно через ${resendIn} с`
                  : 'Отправить код повторно'}
            </Button>
          </section>
        ) : null}

        {step === 'minecraft' && verification && completionToken ? (
          <MinecraftLinkStep
            verificationId={verification.verificationId}
            completionToken={completionToken}
            username={values.username}
            preview={preview}
            onConfirmed={() => {
              setError(null);
              setStep('create');
            }}
          />
        ) : null}

        {step === 'create' ? (
          <ul
            className="flex flex-col gap-1.5 border-t border-border-subtle pt-4 text-sm"
            data-testid="create-step"
            role="status"
          >
            <li className="flex items-center gap-2">
              <CircleCheck aria-hidden className="size-4 shrink-0 text-success" />
              Почта {verification?.maskedEmail} подтверждена.
            </li>
            {minecraftRequired ? (
              <li className="flex items-center gap-2">
                <CircleCheck aria-hidden className="size-4 shrink-0 text-success" />
                Minecraft-аккаунт {values.username} подтверждён.
              </li>
            ) : null}
          </ul>
        ) : null}

        {errorBlock}

        {step !== 'minecraft' ? (
          <Button
            type="submit"
            size="lg"
            loading={pending}
            // Без обоих согласий кнопка недоступна по-настоящему (disabled:
            // нельзя нажать ни мышью, ни клавиатурой); сервер проверяет их
            // повторно (@Equals(true) в RegisterStartDto).
            disabled={
              step === 'details'
                ? !captchaReady || !consentsOk
                : step === 'code'
                  ? code.length !== 6
                  : false
            }
            aria-describedby={step === 'details' && !consentsOk ? consentsHintId : undefined}
            data-testid="register-primary"
          >
            {step === 'details' ? (
              <>
                <MailCheck />
                Подтвердить почту
              </>
            ) : step === 'code' ? (
              <>
                <ShieldCheck />
                Подтвердить код
              </>
            ) : (
              <>
                <UserPlus />
                Создать аккаунт
              </>
            )}
          </Button>
        ) : null}
        {/* Ник/e-mail успели занять или подтверждение устарело — вернуться к
            форме (введённые данные сохраняются) и пройти подтверждение заново. */}
        {step === 'create' && error && !pending ? (
          <Button variant="ghost" size="sm" className="self-start" onClick={changeEmail}>
            <Pencil />
            Изменить данные
          </Button>
        ) : null}
      </form>
    </AuthShell>
  );
}
