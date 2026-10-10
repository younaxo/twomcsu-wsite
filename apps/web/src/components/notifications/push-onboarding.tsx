'use client';

import { BellRing, CircleHelp } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/auth/store';
import {
  pushPermission,
  pushSupported,
  requestPushPermission,
  subscribeThisDevice,
  type EnablePushResult,
  type PushPermission,
} from '@/lib/notifications/push';
import { notificationSettingsKeys, useVapidKey } from '@/lib/notifications/settings';
import { dialogOpen, useOnboardingQueue } from '@/lib/onboarding';
import { useQueryClient } from '@tanstack/react-query';

/// Onboarding разрешения уведомлений (N1, ADR-0097) — по образцу spotlight
/// регистрации: страница слегка затемняется, колокольчик — над затемнением,
/// рядом подсказка «Не пропускайте новые сообщения» [Разрешить] [Не сейчас].
/// Системный запрос браузера — только по нажатию «Разрешить».
///
/// Когда: вошедшим, на сайте (не в auth), через несколько секунд на странице;
/// разрешение ещё не запрошено; push настроен на сервере; не открыт другой
/// диалог; очередь onboarding свободна. «Не сейчас» — не показывать 14 дней
/// (включить можно в «Настройки → Уведомления»); закрытие — до следующей
/// сессии. Заблокировано в браузере — «Как включить», без повторных запросов.

const SNOOZE_KEY = 'twomc.push-onboarding.snoozed-until';
const SESSION_KEY = 'twomc.push-onboarding.shown';
export const PUSH_SNOOZE_DAYS = 14;
const DEFAULT_SNOOZE_DAYS = 3;
export const PUSH_ONBOARDING_DELAY_MS = 6000;

function readNumber(storage: Storage | undefined, key: string): number {
  try {
    return Number(storage?.getItem(key) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function write(storage: Storage | undefined, key: string, value: string) {
  try {
    storage?.setItem(key, value);
  } catch {
    // Хранилище недоступно (приватный режим) — подсказка просто может повториться.
  }
}

export function snoozePushOnboarding(days: number, now = Date.now()) {
  write(globalThis.localStorage, SNOOZE_KEY, String(now + days * 86_400_000));
}

export function pushOnboardingSnoozed(now = Date.now()): boolean {
  return readNumber(globalThis.localStorage, SNOOZE_KEY) > now;
}

export type PushOnboardingStep = 'ask' | 'denied';

export function usePushOnboarding() {
  const client = useQueryClient();
  const authenticated = useAuthStore((state) => state.status === 'authenticated');
  const vapid = useVapidKey();
  const claim = useOnboardingQueue((state) => state.claim);
  const release = useOnboardingQueue((state) => state.release);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<PushOnboardingStep>('ask');
  const [pending, setPending] = useState(false);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    if (!authenticated || !vapid.data?.configured) return;
    if (!pushSupported() || pushPermission() !== 'default') return;
    if (pushOnboardingSnoozed()) return;
    if (readNumber(globalThis.sessionStorage, SESSION_KEY) > 0) return;
    const id = window.setTimeout(() => {
      if (dialogOpen() || !claim('notifications')) return;
      write(globalThis.sessionStorage, SESSION_KEY, '1');
      setStep('ask');
      setOpen(true);
    }, PUSH_ONBOARDING_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [authenticated, vapid.data?.configured, claim]);

  const close = useCallback(() => {
    setOpen(false);
    release('notifications');
  }, [release]);

  const later = useCallback(() => {
    snoozePushOnboarding(PUSH_SNOOZE_DAYS);
    close();
  }, [close]);

  const allow = useCallback(async () => {
    setPending(true);
    try {
      const permission = await requestPushPermission();
      if (permission === 'granted') {
        const result = await subscribeThisDevice();
        void client.invalidateQueries({ queryKey: notificationSettingsKeys.devices });
        if (result.ok) toast.success('Уведомления включены');
        else toast.error(enableErrorText(result));
        close();
      } else if (permission === 'denied') {
        setStep('denied');
      } else {
        // Окно браузера закрыто без решения — не спрашиваем сразу снова.
        snoozePushOnboarding(DEFAULT_SNOOZE_DAYS);
        close();
      }
    } finally {
      setPending(false);
    }
  }, [client, close]);

  return { open, step, pending, allow, later, close, help, setHelp };
}

export function enableErrorText(result: Exclude<EnablePushResult, { ok: true }>): string {
  switch (result.reason) {
    case 'denied':
      return 'Уведомления заблокированы в браузере';
    case 'not-configured':
      return 'Уведомления на сервере пока не настроены';
    case 'unsupported':
      return 'Этот браузер не поддерживает уведомления';
    case 'no-worker':
      return 'Не удалось подготовить уведомления — обновите страницу';
    default:
      return 'Не удалось включить уведомления. Попробуйте ещё раз.';
  }
}

export const PERMISSION_LABEL: Record<PushPermission, string> = {
  granted: 'Разрешено',
  denied: 'Заблокировано',
  default: 'Не запрошено',
  unsupported: 'Не поддерживается',
};

/// Содержимое подсказки (и на сайте, и в design-lab).
export function PushCoachmark({
  step,
  pending,
  onAllow,
  onLater,
  onHelp,
}: {
  step: PushOnboardingStep;
  pending: boolean;
  onAllow: () => void;
  onLater: () => void;
  onHelp: () => void;
}) {
  if (step === 'denied') {
    return (
      <div className="flex flex-col gap-3" data-step="denied">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold">Уведомления заблокированы в браузере</p>
          <p className="text-sm text-muted-foreground">
            Разрешить их снова можно только в настройках сайта в браузере.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={onHelp}>
            <CircleHelp />
            Как включить
          </Button>
          <Button size="sm" variant="ghost" onClick={onLater}>
            Закрыть
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3" data-step="ask">
      <div className="flex gap-3">
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-soft-foreground"
        >
          <BellRing className="size-4" />
        </span>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold">Не пропускайте новые сообщения</p>
          <p className="text-sm text-muted-foreground">
            Получайте уведомления о новых сообщениях, даже когда вкладка TwoMC в фоне.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={onAllow} loading={pending}>
          <BellRing />
          Разрешить
        </Button>
        <Button size="sm" variant="ghost" onClick={onLater} disabled={pending}>
          Не сейчас
        </Button>
      </div>
    </div>
  );
}

/// «Как включить» — короткая инструкция; программно разрешение не меняем.
export function PushHelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Как включить уведомления</DialogTitle>
          <DialogDescription>
            Сайт не может сам изменить разрешение — это делается в браузере.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-muted-foreground">
            <li>Нажмите на значок слева от адреса twomc.su в адресной строке.</li>
            <li>
              Откройте «Настройки сайта» (Chrome, Edge) или «Разрешения» и найдите «Уведомления».
            </li>
            <li>Выберите «Разрешить» и обновите страницу.</li>
            <li>
              В Windows проверьте, что уведомления браузера не отключены в «Параметры → Система →
              Уведомления».
            </li>
          </ol>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
