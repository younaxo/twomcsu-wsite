'use client';

import type { ConnectedProvider, LinkedAccountDto } from '@twomc/shared';
import { ArrowUpRight, Link2, RefreshCw, TriangleAlert, Unlink } from 'lucide-react';
import { PROVIDER_COLOR } from '@/components/auth/social-auth-result';
import { BrandIcon } from '@/components/shell/brand-icon';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SwitchField } from '@/components/ui/switch';
import { Tooltip } from '@/components/ui/tooltip';
import { PROVIDER_LABEL } from '@/lib/auth/social';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';

/// Привязанный аккаунт (ADR-0101) — один production-компонент для всех
/// провайдеров реестра (Discord, Telegram, VK, Steam; Google/GitHub позже —
/// новой записью). Состояния: не привязан, привязан, скрыт в профиле, ошибка
/// (реальная — не удалось начать привязку), требуется повторная авторизация
/// (источника пока нет: токены провайдеров не хранятся — только в design-lab),
/// скоро (интеграции ещё нет).

export type ConnectedAccountState = 'unlinked' | 'linked' | 'hidden' | 'error' | 'reauth' | 'soon';

const STATE_BADGE: Record<
  ConnectedAccountState,
  { label: string; tone: 'success' | 'neutral' | 'destructive' | 'warning' }
> = {
  unlinked: { label: 'Не привязан', tone: 'neutral' },
  linked: { label: 'Привязан', tone: 'success' },
  hidden: { label: 'Скрыт в профиле', tone: 'neutral' },
  error: { label: 'Ошибка', tone: 'destructive' },
  reauth: { label: 'Требуется повторная авторизация', tone: 'warning' },
  soon: { label: 'Скоро', tone: 'neutral' },
};

/// Состояние по реальным данным: привязка, видимость, интеграция, ошибка.
export function connectedAccountState(input: {
  account: LinkedAccountDto | undefined;
  integration: boolean;
  error: string | null;
}): ConnectedAccountState {
  if (input.error) return 'error';
  if (input.account) return input.account.isPublic ? 'linked' : 'hidden';
  return input.integration ? 'unlinked' : 'soon';
}

export function ConnectedAccountCard({
  provider,
  state,
  account,
  available = true,
  error,
  pending = false,
  visibilityPending = false,
  onConnect,
  onDisconnect,
  onVisibility,
}: {
  provider: ConnectedProvider;
  state: ConnectedAccountState;
  account?: LinkedAccountDto;
  /// Вход через провайдера настроен на сервере (иначе «Подключить» недоступно).
  available?: boolean;
  error?: string | null;
  pending?: boolean;
  visibilityPending?: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onVisibility?: (isPublic: boolean) => void;
}) {
  const label = PROVIDER_LABEL[provider];
  const badge = STATE_BADGE[state];
  const linked = Boolean(account) && state !== 'unlinked' && state !== 'soon';
  const name = account
    ? [account.username ? `@${account.username}` : null, account.displayName]
        .filter(Boolean)
        .join(' · ') || 'Аккаунт привязан'
    : null;

  const description =
    state === 'soon'
      ? 'Привязка появится позже. Вручную аккаунт не добавляется — только через вход у сервиса.'
      : state === 'error'
        ? (error ?? 'Не удалось связаться с сервисом. Попробуйте ещё раз.')
        : state === 'reauth'
          ? 'Сервис отозвал доступ — войдите через него ещё раз, чтобы обновить привязку.'
          : !account
            ? available
              ? 'Привяжите, чтобы входить в twomc.su без пароля и показать аккаунт в профиле.'
              : 'Вход через этот сервис пока не настроен.'
            : null;

  return (
    <li
      className={cn(
        'flex min-w-0 flex-col gap-4 rounded-xl bg-surface p-4 shadow-sm',
        state === 'error' && 'ring-1 ring-destructive/40',
        state === 'reauth' && 'ring-1 ring-warning/40',
      )}
      data-testid="connected-account"
      data-provider={provider}
      data-state={state}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="relative shrink-0">
          {account?.avatarUrl ? (
            <Avatar src={account.avatarUrl} name={account.username ?? label} size="md" />
          ) : (
            <span
              className={cn(
                'flex size-10 items-center justify-center rounded-lg bg-background-subtle [&_svg]:size-5',
                state === 'soon' ? 'text-muted-foreground' : PROVIDER_COLOR[provider],
              )}
            >
              <BrandIcon id={provider} />
            </span>
          )}
          {account?.avatarUrl ? (
            <span
              aria-hidden
              className={cn(
                'absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full bg-surface ring-2 ring-surface [&_svg]:size-3',
                PROVIDER_COLOR[provider],
              )}
            >
              <BrandIcon id={provider} />
            </span>
          ) : null}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="flex min-w-0 flex-wrap items-center gap-2 font-medium">
            {label}
            <Badge tone={badge.tone} data-testid="connected-account-state">
              {badge.label}
            </Badge>
          </p>
          {name ? <p className="truncate text-sm">{name}</p> : null}
          {description ? (
            <p
              className={cn(
                'flex items-start gap-1.5 text-sm',
                state === 'error' ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {state === 'error' ? (
                <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              ) : null}
              {description}
            </p>
          ) : null}
          {account ? (
            <p className="text-xs text-subtle-foreground">
              Привязан {formatDateTime(account.linkedAt)}
              {account.lastLoginAt ? ` · вход ${formatDateTime(account.lastLoginAt)}` : ''}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {linked && account ? (
          <>
            {account.profileUrl ? (
              // Внешний переход подтверждает общий ExternalLinkGuard.
              <Button asChild size="sm" variant="secondary">
                <a href={account.profileUrl} target="_blank" rel="noopener noreferrer nofollow">
                  <ArrowUpRight />
                  Открыть профиль
                </a>
              </Button>
            ) : (
              <Tooltip content="У этого аккаунта нет публичной страницы">
                <Button
                  size="sm"
                  variant="secondary"
                  aria-disabled
                  onClick={(event) => event.preventDefault()}
                >
                  <ArrowUpRight />
                  Открыть профиль
                </Button>
              </Tooltip>
            )}
            {state === 'reauth' ? (
              <Button size="sm" onClick={onConnect} loading={pending}>
                <RefreshCw />
                Войти заново
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={onDisconnect}
              disabled={pending}
            >
              <Unlink />
              Отвязать
            </Button>
            <SwitchField
              wrapperClassName="ml-auto"
              label="Показывать в профиле"
              checked={account.isPublic}
              disabled={visibilityPending}
              onCheckedChange={(checked) => onVisibility?.(checked)}
            />
          </>
        ) : state === 'soon' ? (
          <Tooltip content="Интеграция готовится">
            <Button
              size="sm"
              variant="secondary"
              aria-disabled
              onClick={(event) => event.preventDefault()}
            >
              <Link2 />
              Скоро
            </Button>
          </Tooltip>
        ) : (
          <Button size="sm" onClick={onConnect} disabled={!available} loading={pending}>
            {state === 'error' ? <RefreshCw /> : <Link2 />}
            {state === 'error' ? 'Повторить' : 'Подключить'}
          </Button>
        )}
      </div>
    </li>
  );
}
