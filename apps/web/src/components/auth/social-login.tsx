'use client';

import type { ExternalProvider } from '@twomc/shared';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { BrandIcon } from '@/components/shell/brand-icon';
import { buttonVariants } from '@/components/ui/button';
import { LabeledSeparator } from '@/components/ui/separator';
import { cn } from '@/lib/cn';
import { PROVIDER_LABEL, PROVIDERS, socialLoginHref, useSocialProviders } from '@/lib/auth/social';
import { PROVIDER_COLOR } from './social-auth-result';

/// «или» + вход через Discord/Telegram (ADR-0069/0071). Только для аккаунтов,
/// заранее привязанных в профиле — иначе экран «Аккаунт не привязан», без
/// автосоздания. Обе кнопки — одна геометрия; ссылка на API, которое
/// перенаправляет к провайдеру. Ненастроенный провайдер не показывается.
export function SocialLogin({ next, disabled = false }: { next: string; disabled?: boolean }) {
  const providers = useSocialProviders();
  const [pending, setPending] = useState<ExternalProvider | null>(null);
  const loading = providers.isPending;
  const visible = loading
    ? PROVIDERS
    : PROVIDERS.filter((provider) => providers.data?.[provider].enabled);
  if (visible.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-4" data-testid="social-login">
      <LabeledSeparator>или</LabeledSeparator>
      <div className={cn('grid gap-2', visible.length > 1 && 'sm:grid-cols-2')}>
        {visible.map((provider) => {
          const unavailable = loading || disabled || (pending !== null && pending !== provider);
          return (
            <a
              key={provider}
              href={unavailable ? undefined : socialLoginHref(provider, next)}
              // У <a> без href нет роли link — задаём явно, чтобы недоступная
              // кнопка оставалась понятной для screen reader'ов.
              role={unavailable ? 'link' : undefined}
              aria-disabled={unavailable || undefined}
              aria-busy={pending === provider || undefined}
              data-social={provider}
              onClick={(event) => {
                if (unavailable) {
                  event.preventDefault();
                  return;
                }
                setPending(provider);
              }}
              className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }), 'w-full')}
            >
              {pending === provider ? (
                <Loader2 aria-hidden className="animate-spin" />
              ) : (
                <span className={cn('inline-flex [&_svg]:size-[18px]', PROVIDER_COLOR[provider])}>
                  <BrandIcon id={provider} />
                </span>
              )}
              {PROVIDER_LABEL[provider]}
            </a>
          );
        })}
      </div>
    </div>
  );
}
