'use client';

import type { ExternalProvider } from '@twomc/shared';
import { useId, useState } from 'react';
import { BrandIcon } from '@/components/shell/brand-icon';
import { Button, buttonVariants } from '@/components/ui/button';
import { LabeledSeparator } from '@/components/ui/separator';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';
import { PROVIDER_LABEL, PROVIDERS, socialLoginHref, useSocialProviders } from '@/lib/auth/social';
import { PROVIDER_COLOR } from './social-auth-result';

/// «или» + вход через Discord/Telegram (ADR-0069/0071). Только для аккаунтов,
/// заранее привязанных в профиле — иначе экран «Аккаунт не привязан», без
/// автосоздания. Обе кнопки — одна геометрия; ссылка на API, которое
/// перенаправляет к провайдеру.
///
/// Обе кнопки отображаются ВСЕГДА (ADR-0087): ненастроенный или временно
/// недоступный провайдер — disabled с подсказкой, ошибка проверки — disabled и
/// «Повторить». Провайдер не исчезает из интерфейса молча, layout стабилен.
export function SocialLogin({ next, disabled = false }: { next: string; disabled?: boolean }) {
  const providers = useSocialProviders();
  const [pending, setPending] = useState<ExternalProvider | null>(null);
  const hintId = useId();
  const loading = providers.isPending;
  const failed = !loading && !providers.data;
  return (
    <div
      className="flex flex-col gap-4"
      data-testid="social-login"
      aria-busy={loading || undefined}
    >
      <LabeledSeparator>или</LabeledSeparator>
      <div className="grid gap-2 sm:grid-cols-2">
        {PROVIDERS.map((provider) => {
          const configured = providers.data?.[provider].enabled ?? false;
          const offline = !loading && !failed && !configured;
          const unavailable =
            loading || failed || offline || disabled || (pending !== null && pending !== provider);
          const hint = offline
            ? `Вход через ${PROVIDER_LABEL[provider]} временно недоступен`
            : null;
          const link = (
            <a
              key={provider}
              href={unavailable ? undefined : socialLoginHref(provider, next)}
              // У <a> без href нет роли link — задаём явно, чтобы недоступная
              // кнопка оставалась понятной для screen reader'ов.
              role={unavailable ? 'link' : undefined}
              aria-disabled={unavailable || undefined}
              aria-busy={pending === provider || undefined}
              data-loading={pending === provider || undefined}
              data-loading-motion="pulse"
              aria-describedby={hint ? `${hintId}-${provider}` : undefined}
              data-social={provider}
              data-state={
                loading ? 'loading' : failed ? 'error' : offline ? 'unavailable' : 'ready'
              }
              onClick={(event) => {
                if (unavailable) {
                  event.preventDefault();
                  return;
                }
                setPending(provider);
              }}
              className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }), 'w-full')}
            >
              {/* Переход к провайдеру: пульсирует сама иконка (без второго спиннера). */}
              <span
                data-slot="icon"
                className={cn(
                  'inline-flex [&_svg]:size-[18px]',
                  offline ? 'text-muted-foreground' : PROVIDER_COLOR[provider],
                )}
              >
                <BrandIcon id={provider} />
              </span>
              {PROVIDER_LABEL[provider]}
            </a>
          );
          return hint ? (
            <Tooltip key={provider} content={hint}>
              {link}
            </Tooltip>
          ) : (
            link
          );
        })}
      </div>
      {PROVIDERS.map((provider) =>
        !loading && !failed && !providers.data?.[provider].enabled ? (
          <span key={provider} id={`${hintId}-${provider}`} className="sr-only">
            Вход через {PROVIDER_LABEL[provider]} временно недоступен
          </span>
        ) : null,
      )}
      {failed ? (
        <p
          className="flex flex-wrap items-center justify-center gap-x-2 text-xs text-muted-foreground"
          role="status"
        >
          Не удалось проверить вход через Discord и Telegram.
          <Button
            variant="link"
            size="sm"
            className="text-xs"
            loading={providers.isFetching}
            onClick={() => void providers.refetch()}
          >
            Повторить
          </Button>
        </p>
      ) : null}
    </div>
  );
}
