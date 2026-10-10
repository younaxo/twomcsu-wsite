'use client';

import type { NotificationSettingsDto, UpdateNotificationSettingsRequest } from '@twomc/shared';
import { useQueryClient } from '@tanstack/react-query';
import { BellRing, CircleHelp, MonitorSmartphone, Trash2, Volume2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { QueryBoundary } from '@/components/admin/query-boundary';
import { RequireSession } from '@/components/auth/require-session';
import {
  PERMISSION_LABEL,
  PushHelpDialog,
  enableErrorText,
} from '@/components/notifications/push-onboarding';
import { Badge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { Skeleton, SkeletonRows } from '@/components/ui/skeleton';
import { SwitchField } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast';
import { getErrorMessage } from '@/lib/api/errors';
import { formatDateTime } from '@/lib/format';
import {
  pushPermission,
  requestPushPermission,
  subscribeThisDevice,
  thisDeviceSubscribed,
  unsubscribeThisDevice,
  type PushPermission,
} from '@/lib/notifications/push';
import {
  MESSAGE_TYPE,
  messagesEnabled,
  notificationSettingsKeys,
  useNotificationSettings,
  usePushDevices,
  useRemovePushDevice,
  useSetTypeEnabled,
  useUpdateNotificationSettings,
  useVapidKey,
} from '@/lib/notifications/settings';
import { notificationSound } from '@/lib/notifications/sound';

/// «Настройки → Уведомления» (N6, ADR-0097): системные уведомления этого
/// браузера (разрешение, подписка), сообщения, звук, превью в push, тосты при
/// открытом сайте, устройства с push. Разрешение браузера запрашивается только
/// по кнопке; заблокировано — инструкция, без повторных запросов.

const island = 'flex flex-col gap-4 rounded-xl bg-surface p-5 shadow-sm';

const PERMISSION_TONE: Record<PushPermission, 'success' | 'destructive' | 'neutral'> = {
  granted: 'success',
  denied: 'destructive',
  default: 'neutral',
  unsupported: 'neutral',
};

function SystemNotifications({ settings }: { settings: NotificationSettingsDto }) {
  const client = useQueryClient();
  const vapid = useVapidKey();
  const update = useUpdateNotificationSettings();
  const [permission, setPermission] = useState<PushPermission>('default');
  const [subscribed, setSubscribed] = useState(false);
  const [pending, setPending] = useState(false);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    setPermission(pushPermission());
    void thisDeviceSubscribed().then(setSubscribed);
  }, []);

  const configured = vapid.data?.configured ?? false;
  const devicePush = settings.pushEnabled && subscribed && permission === 'granted';

  const enable = async () => {
    setPending(true);
    try {
      // Системный запрос — только здесь, по нажатию переключателя/кнопки.
      const next = permission === 'granted' ? 'granted' : await requestPushPermission();
      setPermission(next);
      if (next !== 'granted') {
        if (next === 'denied') setHelp(true);
        return;
      }
      const result = await subscribeThisDevice();
      if (!result.ok) {
        toast.error(enableErrorText(result));
        return;
      }
      if (!settings.pushEnabled) await update.mutateAsync({ pushEnabled: true });
      setSubscribed(true);
      void client.invalidateQueries({ queryKey: notificationSettingsKeys.devices });
      toast.success('Уведомления включены');
    } finally {
      setPending(false);
    }
  };

  const disable = async () => {
    setPending(true);
    try {
      await unsubscribeThisDevice();
      setSubscribed(false);
      void client.invalidateQueries({ queryKey: notificationSettingsKeys.devices });
      toast.success('Уведомления на этом устройстве выключены');
    } finally {
      setPending(false);
    }
  };

  return (
    <section className={island} aria-label="Системные уведомления">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BellRing aria-hidden className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">Системные уведомления</h2>
        </div>
        <Badge tone={PERMISSION_TONE[permission]} data-testid="push-permission">
          {PERMISSION_LABEL[permission]}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        О новых сообщениях — даже когда вкладка TwoMC в фоне или браузер свёрнут (в Windows — в
        центре уведомлений). Звук системного уведомления задают браузер и Windows.
      </p>
      {vapid.isPending ? (
        <Skeleton className="h-9 w-full" />
      ) : !configured ? (
        <p className="text-sm text-muted-foreground" data-testid="push-not-configured">
          На сервере уведомления пока не настроены — включить их сейчас нельзя.
        </p>
      ) : permission === 'unsupported' ? (
        <p className="text-sm text-muted-foreground">Этот браузер не поддерживает уведомления.</p>
      ) : permission === 'denied' ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground">Уведомления заблокированы в браузере.</p>
          <Button size="sm" variant="secondary" onClick={() => setHelp(true)}>
            <CircleHelp />
            Как включить
          </Button>
        </div>
      ) : (
        <SwitchField
          label="Push-уведомления на этом устройстве"
          description={devicePush ? 'Включены' : 'Выключены'}
          checked={devicePush}
          disabled={pending}
          onCheckedChange={(checked) => void (checked ? enable() : disable())}
        />
      )}
      <PushHelpDialog open={help} onOpenChange={setHelp} />
    </section>
  );
}

function Preferences({ settings }: { settings: NotificationSettingsDto }) {
  const update = useUpdateNotificationSettings();
  const setType = useSetTypeEnabled();
  const patch = (body: UpdateNotificationSettingsRequest) =>
    update.mutateAsync(body).catch((error) => toast.error(getErrorMessage(error)));

  return (
    <section className={island} aria-label="Сообщения и звук">
      <SwitchField
        label="Сообщения"
        description="Уведомлять о новых личных сообщениях"
        checked={messagesEnabled(settings)}
        disabled={setType.isPending}
        onCheckedChange={(enabled) =>
          void setType
            .mutateAsync({ type: MESSAGE_TYPE, enabled })
            .catch((error) => toast.error(getErrorMessage(error)))
        }
      />
      <SwitchField
        label="Звук уведомлений"
        description="Короткий тихий сигнал, пока сайт открыт"
        checked={settings.soundEnabled}
        disabled={update.isPending}
        onCheckedChange={(soundEnabled) => void patch({ soundEnabled })}
      />
      <SwitchField
        label="Предпросмотр сообщения"
        description="Имя отправителя и начало текста в системном уведомлении. Выключено — только «Новое сообщение»."
        checked={settings.pushPreview}
        disabled={update.isPending}
        onCheckedChange={(pushPreview) => void patch({ pushPreview })}
      />
      <SwitchField
        label="Уведомления, когда сайт открыт"
        description="Всплывающее уведомление внутри сайта"
        checked={settings.foregroundEnabled}
        disabled={update.isPending}
        onCheckedChange={(foregroundEnabled) => void patch({ foregroundEnabled })}
      />
      <div>
        <Button
          size="sm"
          variant="secondary"
          disabled={!settings.soundEnabled}
          onClick={() => notificationSound.preview()}
        >
          <Volume2 />
          Проверить звук
        </Button>
      </div>
    </section>
  );
}

function Devices() {
  const devices = usePushDevices();
  const remove = useRemovePushDevice();
  if (devices.isPending || !devices.data?.length) return null;
  return (
    <section className={island} aria-label="Устройства">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <MonitorSmartphone aria-hidden className="size-4 text-muted-foreground" />
        Устройства с уведомлениями
      </h2>
      <ul className="divide-y divide-border-subtle">
        {devices.data.map((device) => (
          <li key={device.id} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{device.deviceName ?? 'Браузер'}</p>
              <p className="text-xs text-subtle-foreground">
                Подключено {formatDateTime(device.createdAt)}
              </p>
            </div>
            <IconButton
              size="sm"
              aria-label={`Отключить уведомления: ${device.deviceName ?? 'браузер'}`}
              loading={remove.isPending && remove.variables === device.id}
              onClick={() =>
                void remove
                  .mutateAsync(device.id)
                  .catch((error) => toast.error(getErrorMessage(error)))
              }
            >
              <Trash2 />
            </IconButton>
          </li>
        ))}
      </ul>
    </section>
  );
}

function NotificationSettingsContent() {
  const settings = useNotificationSettings();
  return (
    <QueryBoundary query={settings} skeleton={<SkeletonRows rows={5} />}>
      {(data) => (
        <div className="flex flex-col gap-5">
          <SystemNotifications settings={data} />
          <Preferences settings={data} />
          <Devices />
        </div>
      )}
    </QueryBoundary>
  );
}

export default function NotificationSettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Уведомления"
        description="Системные уведомления о сообщениях, звук и что показывать в уведомлении."
      />
      <RequireSession>
        <NotificationSettingsContent />
      </RequireSession>
    </div>
  );
}
