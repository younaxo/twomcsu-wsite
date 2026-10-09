'use client';

import type { ExternalProvider, LinkedAccountDto } from '@twomc/shared';
import { Link2, ShieldCheck } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { RequireSession } from '@/components/auth/require-session';
import { BrandIcon } from '@/components/shell/brand-icon';
import { ConfirmDialog } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { getErrorMessage } from '@/lib/api/errors';
import {
  describeSocialError,
  PROVIDER_LABEL,
  requestTelegramAuth,
  useLinkedAccountMutations,
  useLinkedAccounts,
  useSocialProviders,
} from '@/lib/auth/social';
import { formatDateTime } from '@/lib/format';

const PROVIDERS: ExternalProvider[] = ['discord', 'telegram'];

function ProviderRow({
  provider,
  account,
  enabled,
  onConnect,
  onDisconnect,
  pending,
}: {
  provider: ExternalProvider;
  account: LinkedAccountDto | undefined;
  enabled: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  pending: boolean;
}) {
  return (
    <li className="flex flex-wrap items-center gap-4 py-4" data-provider={provider}>
      <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-background-subtle [&_svg]:size-5">
        <BrandIcon id={provider} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          {PROVIDER_LABEL[provider]}
          {account ? (
            <Badge tone="success">Подключён</Badge>
          ) : (
            <Badge tone="neutral">Не подключён</Badge>
          )}
        </p>
        <p className="mt-0.5 truncate text-sm text-muted-foreground">
          {account
            ? [account.username ? `@${account.username}` : null, account.displayName]
                .filter(Boolean)
                .join(' · ') || 'Аккаунт привязан'
            : enabled
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
        <Button variant="secondary" size="sm" onClick={onDisconnect} disabled={pending}>
          Отключить
        </Button>
      ) : (
        <Button size="sm" onClick={onConnect} disabled={!enabled} loading={pending}>
          <Link2 />
          Подключить
        </Button>
      )}
    </li>
  );
}

function LinkedAccounts() {
  const searchParams = useSearchParams();
  const providers = useSocialProviders();
  const linked = useLinkedAccounts();
  const { linkTelegram, discordLinkUrl, unlink } = useLinkedAccountMutations();
  const [unlinking, setUnlinking] = useState<ExternalProvider | null>(null);
  const notice = describeSocialError(searchParams.get('link_error'));
  const linkedNow = searchParams.get('linked');
  useEffect(() => {
    if (linkedNow === 'discord') toast.success('Discord подключён');
  }, [linkedNow]);

  const accounts = new Map((linked.data ?? []).map((a) => [a.provider, a]));
  const enabled = (provider: ExternalProvider) =>
    provider === 'discord'
      ? (providers.data?.discord.enabled ?? false)
      : (providers.data?.telegram.enabled ?? false);

  const connect = async (provider: ExternalProvider) => {
    try {
      if (provider === 'discord') {
        const { url } = await discordLinkUrl.mutateAsync();
        window.location.assign(url);
        return;
      }
      const botId = providers.data?.telegram.botId;
      if (!botId) return;
      const payload = await requestTelegramAuth(botId);
      if (!payload) return;
      await linkTelegram.mutateAsync(payload);
      toast.success('Telegram подключён');
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="rounded-xl bg-surface px-5 py-2 shadow-sm edge-highlight md:px-6">
        {notice ? (
          <p
            role="alert"
            className="mt-3 rounded bg-destructive-soft px-3 py-2 text-sm text-destructive"
          >
            {notice}
          </p>
        ) : null}
        {linked.isPending || providers.isPending ? (
          <div className="flex flex-col gap-3 py-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {PROVIDERS.map((provider) => (
              <ProviderRow
                key={provider}
                provider={provider}
                account={accounts.get(provider)}
                enabled={enabled(provider)}
                pending={
                  (provider === 'discord' && discordLinkUrl.isPending) ||
                  (provider === 'telegram' && linkTelegram.isPending)
                }
                onConnect={() => void connect(provider)}
                onDisconnect={() => setUnlinking(provider)}
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
          <li>Привязанный аккаунт позволяет входить в twomc.su через Discord или Telegram.</li>
          <li>Новый аккаунт через Discord/Telegram не создаётся — только вход в этот.</li>
          <li>Пароль остаётся рабочим способом входа.</li>
          <li>Привязка и отвязка записываются в журнал безопасности.</li>
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
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6 px-4 py-8 md:px-6">
      <PageHeader
        title="Связанные аккаунты"
        description="Discord и Telegram для быстрого входа в ваш аккаунт twomc.su."
      />
      <RequireSession>
        <Suspense fallback={null}>
          <LinkedAccounts />
        </Suspense>
      </RequireSession>
    </div>
  );
}
