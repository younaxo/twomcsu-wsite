'use client';

import type { ConnectedProvider, ExternalProvider, LinkedAccountDto } from '@twomc/shared';
import { CONNECTED_PROVIDERS } from '@twomc/shared';
import { Link2, ShieldCheck } from 'lucide-react';
import { Suspense, useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { RequireSession } from '@/components/auth/require-session';
import { PROVIDER_COLOR } from '@/components/auth/social-auth-result';
import { BrandIcon } from '@/components/shell/brand-icon';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SwitchField } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast';
import { Tooltip } from '@/components/ui/tooltip';
import { getErrorMessage } from '@/lib/api/errors';
import {
  PROVIDER_LABEL,
  PROVIDERS as LOGIN_PROVIDERS_LIST,
  useLinkedAccountMutations,
  useLinkedAccounts,
  useSocialProviders,
} from '@/lib/auth/social';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';

/// Провайдеры входа (интеграция есть); VK/Steam — только в реестре привязок.
const LOGIN_PROVIDERS: readonly ConnectedProvider[] = LOGIN_PROVIDERS_LIST;

/// Состояние строки провайдера: не привязан / привязан / скрыт в профиле.
function providerState(account: LinkedAccountDto | undefined) {
  if (!account) return 'unlinked' as const;
  return account.isPublic ? ('linked' as const) : ('hidden' as const);
}

function ProviderRow({
  provider,
  account,
  available,
  onConnect,
  onDisconnect,
  onVisibility,
  pending,
  visibilityPending,
}: {
  provider: ConnectedProvider;
  account: LinkedAccountDto | undefined;
  /// Интеграция есть и настроена — можно привязать.
  available: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onVisibility: (isPublic: boolean) => void;
  pending: boolean;
  visibilityPending: boolean;
}) {
  const state = providerState(account);
  // VK и Steam — в реестре, но интеграции ещё нет: честное «Скоро».
  const soon = !account && !available && !LOGIN_PROVIDERS.includes(provider);
  return (
    <li
      className="flex flex-wrap items-center gap-4 py-4"
      data-provider={provider}
      data-state={soon ? 'soon' : state}
    >
      <span
        className={cn(
          'flex size-11 shrink-0 items-center justify-center rounded-lg bg-background-subtle [&_svg]:size-5',
          soon ? 'text-muted-foreground' : PROVIDER_COLOR[provider],
        )}
      >
        <BrandIcon id={provider} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          {PROVIDER_LABEL[provider]}
          {state === 'unlinked' ? (
            <Badge tone="neutral">{soon ? 'Скоро' : 'Не привязан'}</Badge>
          ) : (
            <Badge tone="success">Привязан</Badge>
          )}
          {state === 'hidden' ? <Badge tone="neutral">Скрыт в профиле</Badge> : null}
        </p>
        <p className="mt-0.5 truncate text-sm text-muted-foreground">
          {account
            ? [account.username ? `@${account.username}` : null, account.displayName]
                .filter(Boolean)
                .join(' · ') || 'Аккаунт привязан'
            : soon
              ? 'Привязка появится позже. Вручную аккаунт не добавляется — только через вход у сервиса.'
              : available
                ? 'Привяжите, чтобы входить в twomc.su без пароля.'
                : 'Вход через этот сервис пока не настроен.'}
        </p>
        {account ? (
          <p className="text-xs text-subtle-foreground">
            Привязан {formatDateTime(account.linkedAt)}
            {account.lastLoginAt ? ` · последний вход ${formatDateTime(account.lastLoginAt)}` : ''}
          </p>
        ) : null}
      </div>
      {account ? (
        <div className="flex w-full flex-wrap items-center justify-end gap-3 sm:w-auto">
          <SwitchField
            label="Показывать в профиле"
            checked={account.isPublic}
            disabled={visibilityPending}
            onCheckedChange={onVisibility}
          />
          <Button variant="secondary" size="sm" onClick={onDisconnect} disabled={pending}>
            Отключить
          </Button>
        </div>
      ) : soon ? (
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
          <Link2 />
          Подключить
        </Button>
      )}
    </li>
  );
}

function LinkedAccounts() {
  const providers = useSocialProviders();
  const linked = useLinkedAccounts();
  const { linkUrl, unlink, visibility } = useLinkedAccountMutations();
  const [unlinking, setUnlinking] = useState<ConnectedProvider | null>(null);
  const [connecting, setConnecting] = useState<ExternalProvider | null>(null);

  const accounts = new Map((linked.data ?? []).map((a) => [a.provider, a]));
  const available = (provider: ConnectedProvider) => providers.data?.[provider]?.enabled ?? false;

  /// Подключение — переход к провайдеру (state с mode=link и id пользователя);
  /// итог показывает /auth/result («Успешно!», «Уже подключено», …).
  const connect = async (provider: ExternalProvider) => {
    setConnecting(provider);
    try {
      const { url } = await linkUrl.mutateAsync(provider);
      window.location.assign(url);
    } catch (error) {
      setConnecting(null);
      toast.error(getErrorMessage(error));
    }
  };

  const changeVisibility = (provider: ConnectedProvider, isPublic: boolean) =>
    visibility
      .mutateAsync({ provider, isPublic })
      .then(() =>
        toast.success(
          isPublic
            ? `${PROVIDER_LABEL[provider]} показывается в профиле`
            : `${PROVIDER_LABEL[provider]} скрыт в профиле`,
        ),
      )
      .catch((error) => toast.error(getErrorMessage(error)));

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="rounded-xl bg-surface px-5 py-2 shadow-sm md:px-6">
        {linked.isPending || providers.isPending ? (
          <div className="flex flex-col gap-3 py-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {CONNECTED_PROVIDERS.map((provider) => (
              <ProviderRow
                key={provider}
                provider={provider}
                account={accounts.get(provider)}
                available={available(provider)}
                pending={connecting === provider}
                visibilityPending={
                  visibility.isPending && visibility.variables?.provider === provider
                }
                onConnect={() =>
                  LOGIN_PROVIDERS.includes(provider)
                    ? void connect(provider as ExternalProvider)
                    : undefined
                }
                onDisconnect={() => setUnlinking(provider)}
                onVisibility={(isPublic) => void changeVisibility(provider, isPublic)}
              />
            ))}
          </ul>
        )}
      </section>
      <aside className="flex flex-col gap-3 rounded-xl bg-background-subtle p-4 text-sm">
        <h2 className="flex items-center gap-2 font-semibold">
          <ShieldCheck aria-hidden className="size-4 text-primary" />
          Как это работает
        </h2>
        <ul className="flex list-disc flex-col gap-1.5 pl-4 text-muted-foreground">
          <li>Привязка подтверждает, что аккаунт ваш: только через вход у сервиса.</li>
          <li>Вручную Discord, Telegram, VK и Steam не указываются — только привязкой.</li>
          <li>Что видно в профиле, настраивается отдельно для каждого сервиса.</li>
          <li>Через Discord и Telegram можно входить; новый аккаунт так не создаётся.</li>
          <li>Привязка, отвязка и видимость записываются в журнал безопасности.</li>
        </ul>
      </aside>
      <ConfirmDialog
        open={unlinking !== null}
        onOpenChange={(open) => !open && setUnlinking(null)}
        title={`Отключить ${unlinking ? PROVIDER_LABEL[unlinking] : ''}?`}
        description="Войти через этот сервис будет нельзя, пока вы не привяжете его снова."
        confirmLabel="Отключить"
        destructive
        onConfirm={() =>
          unlinking
            ? unlink
                .mutateAsync(unlinking)
                .then(() => {
                  toast.success(`${PROVIDER_LABEL[unlinking]} отключён`);
                })
                .catch((error) => {
                  toast.error(getErrorMessage(error));
                  throw error;
                })
            : undefined
        }
      />
    </div>
  );
}

/// «Связанные аккаунты» (ADR-0069): Discord/Telegram для входа в этот аккаунт.
export default function LinkedAccountsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Связанные аккаунты"
        description="Подтверждённые Discord, Telegram, VK и Steam: вход в twomc.su и показ в профиле."
      />
      <RequireSession>
        <Suspense fallback={null}>
          <LinkedAccounts />
        </Suspense>
      </RequireSession>
    </div>
  );
}
