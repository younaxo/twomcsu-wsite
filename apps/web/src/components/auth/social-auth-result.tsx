'use client';

import type { ExternalProvider, SocialAuthMode, SocialResultStatus } from '@twomc/shared';
import { CircleAlert, CircleCheck, CircleX, Info, Link2Off, Plus } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useState, type ReactNode } from 'react';
import { BrandIcon } from '@/components/shell/brand-icon';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/cn';
import { PROVIDER_LABEL } from '@/lib/auth/social';
import { SITE_LOGO_URL } from '@/lib/site/config';

/// Итог входа/привязки через Discord/Telegram (ADR-0071): логотип twomc.su +
/// логотип провайдера, иконка статуса, заголовок, пояснение и действия.
/// Никаких технических деталей (кодов, токенов, ответов провайдера).

export const PROVIDER_COLOR: Record<ExternalProvider, string> = {
  discord: 'text-[#5865F2]',
  telegram: 'text-[#26A5E4]',
};

type Tone = 'success' | 'info' | 'warning' | 'danger' | 'neutral';

interface ResultCopy {
  tone: Tone;
  title: string;
  description: string;
  /// Действия: основное «продолжить/вернуться» и (для ошибок) «повторить».
  retry?: boolean;
}

export function describeSocialResult(
  provider: ExternalProvider,
  mode: SocialAuthMode,
  status: SocialResultStatus,
): ResultCopy {
  const name = PROVIDER_LABEL[provider];
  if (mode === 'link') {
    switch (status) {
      case 'linked':
      case 'success':
        return {
          tone: 'success',
          title: 'Успешно!',
          description: `${name} подключён к вашему аккаунту.`,
        };
      case 'already_linked':
        return {
          tone: 'info',
          title: 'Уже подключено',
          description: `Этот ${name} уже связан с вашим аккаунтом twomc.su.`,
        };
      case 'taken':
        return {
          tone: 'warning',
          title: `Не удалось подключить ${name}`,
          description: `Этот ${name} уже связан с другим аккаунтом twomc.su.`,
        };
      case 'slot_taken':
        return {
          tone: 'warning',
          title: `Не удалось подключить ${name}`,
          description: `К вашему аккаунту уже подключён другой ${name}. Сначала отключите его в настройках.`,
        };
      case 'cancelled':
        return {
          tone: 'neutral',
          title: 'Подключение отменено',
          description: `Вы отменили авторизацию через ${name}.`,
        };
      case 'unavailable':
        return {
          tone: 'warning',
          title: `${name} недоступен`,
          description: `Подключение ${name} временно не настроено.`,
        };
      default:
        return {
          tone: 'danger',
          title: `Не удалось подключить ${name}`,
          description:
            status === 'expired'
              ? 'Сессия подключения устарела. Попробуйте ещё раз.'
              : 'Попробуйте ещё раз.',
          retry: true,
        };
    }
  }
  switch (status) {
    case 'success':
      return {
        tone: 'success',
        title: 'Успешно!',
        description: `Вы вошли в twomc.su через ${name}.`,
      };
    case 'not_linked':
      return {
        tone: 'info',
        title: 'Аккаунт не привязан',
        description: `Этот ${name}-аккаунт не связан с аккаунтом twomc.su. Чтобы входить этим способом, сначала войдите обычным способом и подключите аккаунт в настройках профиля.`,
      };
    case 'cancelled':
      return {
        tone: 'neutral',
        title: 'Вход отменён',
        description: `Вы отменили авторизацию через ${name}.`,
      };
    case 'unavailable':
      return {
        tone: 'warning',
        title: `Вход через ${name} недоступен`,
        description: 'Этот способ входа временно не настроен. Войдите по e-mail или нику.',
      };
    default:
      return {
        tone: 'danger',
        title: 'Не удалось выполнить вход',
        description:
          status === 'expired'
            ? 'Сессия входа устарела. Попробуйте ещё раз.'
            : 'Попробуйте ещё раз.',
        retry: true,
      };
  }
}

const TONE_ICON: Record<Tone, { icon: ReactNode; className: string }> = {
  success: { icon: <CircleCheck />, className: 'bg-success-soft text-success' },
  info: { icon: <Info />, className: 'bg-info-soft text-info' },
  warning: { icon: <Link2Off />, className: 'bg-warning-soft text-warning' },
  danger: { icon: <CircleAlert />, className: 'bg-destructive-soft text-destructive' },
  neutral: { icon: <CircleX />, className: 'bg-muted text-muted-foreground' },
};

/// Логотипы «twomc.su + провайдер».
export function SocialAuthBrands({ provider }: { provider: ExternalProvider }) {
  return (
    <div className="flex items-center gap-3" aria-hidden>
      <Image
        src={SITE_LOGO_URL}
        alt=""
        width={48}
        height={48}
        quality={90}
        draggable={false}
        data-logo="main"
        className="size-12 select-none rounded-xl shadow-sm"
      />
      <Plus className="size-4 text-subtle-foreground" />
      <span
        className={cn(
          'flex size-12 items-center justify-center rounded-xl bg-surface shadow-sm edge-highlight [&_svg]:size-6',
          PROVIDER_COLOR[provider],
        )}
      >
        <BrandIcon id={provider} />
      </span>
    </div>
  );
}

export interface SocialAuthResultProps {
  provider: ExternalProvider;
  mode: SocialAuthMode;
  status: SocialResultStatus;
  /// Вход: сессия ещё поднимается из refresh-cookie.
  pending?: boolean;
  /// Основное действие: «Продолжить» / «Вернуться ко входу» / «Вернуться в настройки».
  onPrimary: () => void;
  onRetry?: () => void;
  retrying?: boolean;
  /// Через сколько секунд произойдёт автопереход (успешный вход).
  autoContinueIn?: number | null;
}

export function SocialAuthResult({
  provider,
  mode,
  status,
  pending = false,
  onPrimary,
  onRetry,
  retrying = false,
  autoContinueIn = null,
}: SocialAuthResultProps) {
  const copy = describeSocialResult(provider, mode, status);
  const tone = TONE_ICON[copy.tone];
  const success = copy.tone === 'success' && mode === 'login';
  const primaryLabel = success
    ? 'Продолжить'
    : mode === 'link'
      ? 'Вернуться в настройки'
      : 'Вернуться ко входу';
  return (
    <div
      className="flex flex-col gap-6"
      data-testid="social-auth-result"
      data-status={status}
      data-mode={mode}
    >
      <SocialAuthBrands provider={provider} />
      {pending ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-4" />
          Входим в twomc.su через {PROVIDER_LABEL[provider]}…
        </p>
      ) : (
        <>
          <div className="flex items-start gap-4">
            <span
              aria-hidden
              className={cn(
                'flex size-10 shrink-0 items-center justify-center rounded-full [&_svg]:size-5',
                tone.className,
              )}
            >
              {tone.icon}
            </span>
            <div className="flex min-w-0 flex-col gap-1.5" role="status">
              <h1
                id="auth-title"
                className="font-display text-2xl font-bold tracking-tight md:text-[1.75rem]"
              >
                {copy.title}
              </h1>
              <p className="text-sm text-muted-foreground">{copy.description}</p>
              {success && autoContinueIn !== null ? (
                <p className="text-xs text-subtle-foreground">
                  Продолжим автоматически через {autoContinueIn} с.
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            {copy.retry && onRetry ? (
              <Button size="lg" onClick={onRetry} loading={retrying}>
                Повторить
              </Button>
            ) : null}
            <Button
              size="lg"
              variant={copy.retry && onRetry ? 'secondary' : 'primary'}
              onClick={onPrimary}
            >
              {primaryLabel}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/// Обратный отсчёт для автоперехода после успешного входа.
export function useCountdown(seconds: number, active: boolean, onDone: () => void) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (!active) return;
    if (left <= 0) {
      onDone();
      return;
    }
    const id = window.setTimeout(() => setLeft((value) => value - 1), 1000);
    return () => window.clearTimeout(id);
  }, [active, left, onDone]);
  return active ? left : null;
}
