'use client';

import type { ConnectedProvider, ExternalProvider } from '@twomc/shared';
import { CONNECTED_PROVIDERS } from '@twomc/shared';
import { ShieldCheck } from 'lucide-react';
import { Suspense, useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import {
  ConnectedAccountCard,
  connectedAccountState,
} from '@/components/account/connected-account-card';
import { RequireSession } from '@/components/auth/require-session';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { getErrorMessage } from '@/lib/api/errors';
import {
  PROVIDER_LABEL,
  PROVIDERS as LOGIN_PROVIDERS_LIST,
  useLinkedAccountMutations,
  useLinkedAccounts,
  useSocialProviders,
} from '@/lib/auth/social';

/// Провайдеры входа (интеграция есть); VK/Steam — только в реестре привязок.
const LOGIN_PROVIDERS: readonly ConnectedProvider[] = LOGIN_PROVIDERS_LIST;

function LinkedAccounts() {
  const providers = useSocialProviders();
  const linked = useLinkedAccounts();
  const { linkUrl, unlink, visibility } = useLinkedAccountMutations();
  const [unlinking, setUnlinking] = useState<ConnectedProvider | null>(null);
  const [connecting, setConnecting] = useState<ExternalProvider | null>(null);
  // Реальная ошибка начала привязки — состояние «Ошибка» у карточки сервиса.
  const [errors, setErrors] = useState<Partial<Record<ConnectedProvider, string>>>({});

  const accounts = new Map((linked.data ?? []).map((a) => [a.provider, a]));
  const available = (provider: ConnectedProvider) => providers.data?.[provider]?.enabled ?? false;

  /// Подключение — переход к провайдеру (state с mode=link и id пользователя);
  /// итог показывает /auth/result («Успешно!», «Уже подключено», …).
  const connect = async (provider: ExternalProvider) => {
    setConnecting(provider);
    setErrors((current) => ({ ...current, [provider]: undefined }));
    try {
      const { url } = await linkUrl.mutateAsync(provider);
      window.location.assign(url);
    } catch (error) {
      setConnecting(null);
      setErrors((current) => ({ ...current, [provider]: getErrorMessage(error) }));
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
      <section aria-label="Сервисы">
        {linked.isPending || providers.isPending ? (
          <div className="grid gap-3 md:grid-cols-2">
            {CONNECTED_PROVIDERS.map((provider) => (
              <Skeleton key={provider} className="h-36 w-full rounded-xl" />
            ))}
          </div>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {CONNECTED_PROVIDERS.map((provider) => {
              const account = accounts.get(provider);
              const login = LOGIN_PROVIDERS.includes(provider);
              return (
                <ConnectedAccountCard
                  key={provider}
                  provider={provider}
                  account={account}
                  state={connectedAccountState({
                    account,
                    // VK и Steam — в реестре, но интеграции ещё нет: «Скоро».
                    integration: login,
                    error: errors[provider] ?? null,
                  })}
                  error={errors[provider] ?? null}
                  available={available(provider)}
                  pending={connecting === provider}
                  visibilityPending={
                    visibility.isPending && visibility.variables?.provider === provider
                  }
                  onConnect={() => (login ? void connect(provider as ExternalProvider) : undefined)}
                  onDisconnect={() => setUnlinking(provider)}
                  onVisibility={(isPublic) => void changeVisibility(provider, isPublic)}
                />
              );
            })}
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
