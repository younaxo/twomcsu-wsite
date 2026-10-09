'use client';

import type { RegisterMinecraftChallenge, RegisterStateResponse } from '@twomc/shared';
import { Check, Copy, Loader2, RotateCw, Terminal } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { SITE_CONNECT_COMMAND } from '@/lib/auth/tutorial';

/// Шаг «Подтвердите Minecraft-аккаунт» регистрации (ADR-0072):
/// 15-символьный код со страницы /site-connect → сайт выдаёт 5 символов →
/// игрок вводит `/site-connect <код>` → сервер подтверждает (сайт опрашивает
/// состояние). Все проверки — на backend; здесь только ввод и отображение.

export const LINK_CODE_LENGTH = 15;
const CODE_CHARS = /[^A-HJ-NP-Z2-9]/g;

/// Вставка/ввод: верхний регистр, только символы алфавита кодов, до 15.
export function normalizeLinkCode(raw: string): string {
  return raw.toUpperCase().replace(CODE_CHARS, '').slice(0, LINK_CODE_LENGTH);
}

const ERRORS: Record<string, string> = {
  mc_code_invalid: 'Неверный код привязки. Проверьте 15 символов со страницы ссылки.',
  mc_code_expired: 'Срок кода истёк — введите /site-connect в игре ещё раз.',
  mc_code_used: 'Этот код уже использован — получите новый командой /site-connect.',
  mc_wrong_account: 'Код получен для другого ника. Войдите в игру под ником из регистрации.',
  minecraft_taken: 'Этот Minecraft-аккаунт уже привязан к другому аккаунту twomc.su.',
  completion_invalid: 'Подтверждение почты устарело — начните регистрацию заново.',
  otp_not_found: 'Запрос регистрации устарел — начните заново.',
  mc_no_session: 'Сначала введите код привязки Minecraft.',
};

function errorText(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.body && typeof error.body === 'object') {
    const body = error.body as { code?: unknown; message?: unknown };
    const code =
      typeof body.code === 'string'
        ? body.code
        : body.message && typeof body.message === 'object'
          ? (body.message as { code?: string }).code
          : undefined;
    if (code && ERRORS[code]) return ERRORS[code];
    if (error.status === 429) return 'Слишком много попыток — подождите минуту.';
  }
  return fallback;
}

function useSecondsLeft(target: string | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [target]);
  return target ? Math.max(0, Math.ceil((new Date(target).getTime() - now) / 1000)) : 0;
}

function formatLeft(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export interface MinecraftLinkStepProps {
  verificationId: string;
  completionToken: string;
  username: string;
  /// Уже выданный код (продолжение после перезагрузки сам код не возвращает).
  initialChallenge?: RegisterMinecraftChallenge | null;
  onConfirmed: () => void;
  /// Превью в design-lab: без запросов.
  preview?: boolean;
}

export function MinecraftLinkStep({
  verificationId,
  completionToken,
  username,
  initialChallenge = null,
  onConfirmed,
  preview = false,
}: MinecraftLinkStepProps) {
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<RegisterMinecraftChallenge | null>(initialChallenge);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const errorId = useId();
  const left = useSecondsLeft(challenge?.challengeExpiresAt ?? null);
  const waiting = !!challenge?.challenge && left > 0;

  // Ожидание подтверждения в игре: опрос состояния на сервере.
  useEffect(() => {
    if (preview || !waiting) return;
    const id = window.setInterval(async () => {
      try {
        const state = await api.post<RegisterStateResponse>(
          '/auth/register/state',
          { verificationId, completionToken },
          { auth: false, retryOn401: false },
        );
        if (state.minecraft.confirmed) {
          window.clearInterval(id);
          onConfirmed();
        }
      } catch {
        // Кратковременная ошибка сети — следующий опрос повторит.
      }
    }, 3000);
    return () => window.clearInterval(id);
  }, [preview, waiting, verificationId, completionToken, onConfirmed]);

  const submit = async () => {
    if (code.length !== LINK_CODE_LENGTH || pending || preview) return;
    setPending(true);
    setError(null);
    try {
      const result = await api.post<RegisterMinecraftChallenge>(
        '/auth/register/minecraft/code',
        { verificationId, completionToken, code },
        { auth: false, retryOn401: false },
      );
      if (result.confirmed) {
        onConfirmed();
        return;
      }
      setChallenge(result);
      setCode('');
    } catch (caught) {
      setError(errorText(caught, 'Не удалось проверить код. Попробуйте ещё раз.'));
    } finally {
      setPending(false);
    }
  };

  const renew = async () => {
    if (pending || preview) return;
    setPending(true);
    setError(null);
    try {
      setChallenge(
        await api.post<RegisterMinecraftChallenge>(
          '/auth/register/minecraft/challenge',
          { verificationId, completionToken },
          { auth: false, retryOn401: false },
        ),
      );
    } catch (caught) {
      setError(errorText(caught, 'Не удалось получить новый код.'));
    } finally {
      setPending(false);
    }
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Не удалось скопировать — выделите код вручную.');
    }
  };

  const command = challenge?.challenge ? `${SITE_CONNECT_COMMAND} ${challenge.challenge}` : '';

  return (
    <section
      aria-label="Подтверждение Minecraft-аккаунта"
      className="flex flex-col gap-3 border-t border-border-subtle pt-4"
      data-testid="minecraft-step"
    >
      <p className="text-sm text-muted-foreground">
        Зайдите на сервер под ником <span className="font-medium text-foreground">{username}</span>{' '}
        и введите{' '}
        <code className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-foreground">
          {SITE_CONNECT_COMMAND}
        </code>{' '}
        — откройте ссылку из чата и скопируйте 15 символов.
      </p>

      {!challenge?.challenge || left === 0 ? (
        <Field
          label="Код привязки Minecraft"
          required
          labelAddon={
            <span className="text-xs tabular-nums text-subtle-foreground">
              {code.length}/{LINK_CODE_LENGTH}
            </span>
          }
          error={error}
        >
          <Input
            name="minecraft-code"
            autoComplete="one-time-code"
            spellCheck={false}
            autoCapitalize="characters"
            inputMode="text"
            maxLength={40}
            className="font-mono uppercase tracking-[0.2em]"
            placeholder="15 символов"
            value={code}
            disabled={pending}
            onChange={(event) => {
              setCode(normalizeLinkCode(event.target.value));
              if (error) setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void submit();
              }
            }}
          />
        </Field>
      ) : null}

      {challenge?.challenge && left > 0 ? (
        <div className="flex flex-col gap-3" data-testid="minecraft-challenge" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-sunken px-4 py-3">
            <div>
              <p className="text-xs text-muted-foreground">Ваш код для игры</p>
              <p
                className="font-mono text-2xl font-bold tracking-[0.3em]"
                data-testid="minecraft-challenge-code"
              >
                {challenge.challenge}
              </p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => void copy(command)}>
              {copied ? <Check className="text-success" /> : <Copy />}
              {copied ? 'Скопировано' : 'Скопировать команду'}
            </Button>
          </div>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Terminal aria-hidden className="size-4 shrink-0" />
            Введите в игре: <code className="font-mono text-foreground">{command}</code>
          </p>
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 aria-hidden className="size-4 animate-spin" />
            Ожидаем подтверждение в игре · код действует ещё {formatLeft(left)}
          </p>
          {error ? (
            <p id={errorId} role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}

      {challenge?.challenge && left === 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          Срок 5-символьного кода истёк.
          <Button size="sm" variant="ghost" onClick={() => void renew()} loading={pending}>
            <RotateCw />
            Получить новый код
          </Button>
        </div>
      ) : null}

      {!challenge?.challenge || left === 0 ? (
        <Button
          size="lg"
          onClick={() => void submit()}
          loading={pending}
          disabled={code.length !== LINK_CODE_LENGTH}
          data-testid="minecraft-submit"
        >
          Проверить код
        </Button>
      ) : null}
    </section>
  );
}
