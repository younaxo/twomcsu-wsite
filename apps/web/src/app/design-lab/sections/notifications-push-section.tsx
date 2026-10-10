'use client';

import { Bell, BellRing, Volume2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  PERMISSION_LABEL,
  PushCoachmark,
  PushHelpDialog,
  type PushOnboardingStep,
} from '@/components/notifications/push-onboarding';
import { Badge } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { popoverContentClassName } from '@/components/ui/popover';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import type { PushPermission } from '@/lib/notifications/push';
import { notificationSound } from '@/lib/notifications/sound';

/// Уведомления и push (ADR-0097) — production-компоненты: подсказка
/// разрешения у колокольчика (спросить / заблокировано), «Как включить»,
/// состояния разрешения браузера, уведомление внутри сайта и звук. Системный
/// запрос браузера и подписка в превью не вызываются.

const PERMISSION_TONE: Record<PushPermission, 'success' | 'destructive' | 'neutral'> = {
  granted: 'success',
  denied: 'destructive',
  default: 'neutral',
  unsupported: 'neutral',
};

function Block({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="flex min-w-0 flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{note}</p>
      </div>
      {children}
    </Card>
  );
}

function CoachmarkPreview() {
  const [step, setStep] = useState<PushOnboardingStep>('ask');
  const [pending, setPending] = useState(false);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    if (!pending) return;
    const id = window.setTimeout(() => setPending(false), 1200);
    return () => window.clearTimeout(id);
  }, [pending]);

  return (
    <Block
      title="Подсказка разрешения"
      note="Через несколько секунд на сайте, если разрешение ещё не запрошено: колокольчик над лёгким затемнением, рядом подсказка. Системный запрос — только по «Разрешить»; «Не сейчас» — 14 дней тишины."
    >
      <SegmentedControl
        size="sm"
        aria-label="Шаг подсказки разрешения"
        value={step}
        onValueChange={(value) => setStep(value as PushOnboardingStep)}
        options={[
          { value: 'ask', label: 'Спросить' },
          { value: 'denied', label: 'Заблокировано' },
        ]}
      />
      <div className="flex items-start gap-3" data-testid="push-coachmark-preview">
        <IconButton aria-label="Уведомления" variant="secondary" className="relative z-[1]">
          <Bell />
        </IconButton>
        <div className={cn(popoverContentClassName, 'w-80 max-w-full')}>
          <PushCoachmark
            step={step}
            pending={pending}
            onAllow={() => setPending(true)}
            onLater={() => setStep('ask')}
            onHelp={() => setHelp(true)}
          />
        </div>
      </div>
      <PushHelpDialog open={help} onOpenChange={setHelp} />
    </Block>
  );
}

function PermissionStates() {
  const [help, setHelp] = useState(false);
  return (
    <Block
      title="Разрешение браузера"
      note="Как оно показано в «Настройки → Уведомления». Заблокировано — только инструкция: сайт не может сам изменить разрешение."
    >
      <div className="flex flex-wrap gap-2">
        {(Object.keys(PERMISSION_LABEL) as PushPermission[]).map((permission) => (
          <Badge key={permission} tone={PERMISSION_TONE[permission]}>
            {PERMISSION_LABEL[permission]}
          </Badge>
        ))}
      </div>
      <div>
        <Button size="sm" variant="secondary" onClick={() => setHelp(true)}>
          Как включить
        </Button>
      </div>
      <PushHelpDialog open={help} onOpenChange={setHelp} />
    </Block>
  );
}

function InAppPreview() {
  return (
    <Block
      title="Когда сайт открыт"
      note="Сайт активен, другая страница — уведомление внутри сайта и тихий звук. Открыт этот же диалог — только тихий звук. Вкладка в фоне — системный push, без дублей. Один id — один звук."
    >
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() =>
            toast.message('Новое сообщение', {
              id: 'design-lab:message',
              description: 'younaxo_: Заходи на сервер вечером',
              action: { label: 'Открыть', onClick: () => undefined },
            })
          }
        >
          <BellRing />
          Показать уведомление
        </Button>
        <Button size="sm" variant="secondary" onClick={() => notificationSound.preview()}>
          <Volume2 />
          Проверить звук
        </Button>
      </div>
      <dl className="grid gap-1 text-xs text-muted-foreground">
        <div className="flex gap-2">
          <dt className="font-medium text-foreground">Предпросмотр включён:</dt>
          <dd>«TwoMC · younaxo_» и начало текста (до 120 символов)</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-medium text-foreground">Предпросмотр выключен:</dt>
          <dd>«TwoMC» · «Новое сообщение» — имя и текст в push не отправляются</dd>
        </div>
      </dl>
    </Block>
  );
}

export function NotificationsPushSection() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <CoachmarkPreview />
      <div className="flex min-w-0 flex-col gap-4">
        <PermissionStates />
        <InAppPreview />
      </div>
    </div>
  );
}
