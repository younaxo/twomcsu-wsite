'use client';

import type { NotificationDto } from '@twomc/shared';
import { useState } from 'react';
import { CartButton, ChatButton } from '@/components/shell/floating-actions';
import { LocalePopover } from '@/components/shell/locale-popover';
import { MobileNav } from '@/components/shell/mobile-nav';
import { NotificationsPanel, NotificationsPopover } from '@/components/shell/notifications-popover';
import { PaymentMethodLogos } from '@/components/shell/payment-method-logos';
import { ProfileMenu } from '@/components/shell/profile-menu';
import { ServerStatusButton } from '@/components/shell/server-status-button';
import { OnlineCounter, SidebarRail } from '@/components/shell/sidebar-rail';
import { MojangDisclaimer, SiteFooter } from '@/components/shell/site-footer';
import { SiteHeader } from '@/components/shell/site-header';
import { Card } from '@/components/ui/card';
import { popoverContentClassName } from '@/components/ui/popover';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { cn } from '@/lib/cn';

const VIEWPORTS = [
  { value: 'desktop', label: 'Desktop · 1280' },
  { value: 'tablet', label: 'Tablet · 820' },
  { value: 'mobile', label: 'Mobile · 390' },
];

const WIDTH: Record<string, string> = {
  desktop: 'w-full max-w-[1280px]',
  tablet: 'w-[820px] max-w-full',
  mobile: 'w-[390px] max-w-full',
};

/// GLOBAL SHELL — те же production-компоненты оболочки (не демо-копии):
/// rail, плавающий header (без рамки) и прижатый к низу footer, кнопки
/// чата/корзины, уведомления, профиль, язык/валюта,
/// статус серверов, логотипы оплаты. Данные — реальные запросы к API;
/// без API компоненты показывают честные loading/fallback-состояния.
export function GlobalShellSection() {
  const [viewport, setViewport] = useState('desktop');
  return (
    <div className="flex flex-col gap-6">
      <SegmentedControl
        aria-label="Ширина превью"
        options={VIEWPORTS}
        value={viewport}
        onValueChange={setViewport}
      />
      <div className="overflow-x-auto rounded-lg border bg-background-subtle p-4 scrollbar-thin">
        <div
          className={cn(
            'relative mx-auto flex min-h-[640px] overflow-hidden rounded-lg border bg-background',
            WIDTH[viewport],
          )}
        >
          {viewport === 'desktop' ? (
            <SidebarRail className="!static !flex h-auto min-h-[640px]" />
          ) : null}
          <div className="flex min-w-0 flex-1 flex-col">
            <SiteHeader className="!static" />
            <main className="flex-1 p-6 text-sm text-muted-foreground">Main content</main>
            <SiteFooter />
          </div>
          {viewport === 'desktop' ? (
            <div className="absolute bottom-4 right-4 flex flex-col items-end gap-3">
              <CartButton />
              <ChatButton />
            </div>
          ) : (
            <div className="absolute inset-x-0 bottom-0">
              <MobileNav />
            </div>
          )}
        </div>
      </div>

      <NotificationsPanelPreview />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="flex flex-col gap-3">
          <p className="text-sm font-semibold">Онлайн · уведомления · профиль</p>
          <div className="flex items-center gap-2">
            <OnlineCounter compact />
            <NotificationsPopover />
            <ProfileMenu />
          </div>
          <p className="text-xs text-muted-foreground">
            Колокольчик и префикс роли — для вошедших; анониму — «Войти».
          </p>
        </Card>
        <Card className="flex flex-col gap-3">
          <p className="text-sm font-semibold">Корзина · чат</p>
          <div className="flex items-center gap-3">
            <CartButton />
            <ChatButton />
          </div>
          <p className="text-xs text-muted-foreground">
            Обычные плавающие кнопки в правом нижнем углу; корзина только в /shop*, чат —
            coming-soon состояние.
          </p>
        </Card>
        <Card className="flex flex-col gap-3">
          <p className="text-sm font-semibold">Язык/валюта · статус</p>
          <div className="flex flex-wrap items-center gap-2">
            <LocalePopover variant="footer" />
            <ServerStatusButton />
          </div>
        </Card>
        <Card className="flex flex-col gap-3">
          <p className="text-sm font-semibold">Способы оплаты · дисклеймер</p>
          <PaymentMethodLogos />
          <MojangDisclaimer />
        </Card>
      </div>
    </div>
  );
}

const DEMO_NOTIFICATIONS: NotificationDto[] = [
  {
    id: 'n1',
    type: 'FRIEND_REQUEST',
    title: 'Steve_Mainer хочет добавить вас в друзья',
    message: null,
    link: '/notifications',
    imageUrl: null,
    priority: 'NORMAL',
    actionUrl: null,
    actionLabel: null,
    isRead: false,
    readAt: null,
    createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  },
  {
    id: 'n2',
    type: 'SYSTEM',
    title: 'Технические работы в магазине',
    message:
      'Магазин будет недоступен с 22:00 до 23:00 по Москве. Очень длинный текст уведомления, который должен аккуратно обрезаться в две строки и не вылезать за границы окна.',
    link: null,
    imageUrl: null,
    priority: 'HIGH',
    actionUrl: null,
    actionLabel: null,
    isRead: false,
    readAt: null,
    createdAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
    metadata: { sender: 'system' },
  },
  {
    id: 'n3',
    type: 'ORDER',
    title: 'Заказ №1042 выдан на сервере',
    message: 'Привилегия активирована.',
    link: '/notifications',
    imageUrl: null,
    priority: 'NORMAL',
    actionUrl: null,
    actionLabel: null,
    isRead: true,
    readAt: new Date().toISOString(),
    createdAt: new Date(Date.now() - 26 * 3600_000).toISOString(),
  },
];

type PanelState = 'list' | 'empty' | 'error' | 'loading';

/// Окно уведомлений колокольчика — production `NotificationsPanel` на демо-данных:
/// список (непрочитанные, системное, прочитанное, длинный текст), пусто, ошибка,
/// загрузка. Регрессия: внизу окна ничего не выступает за границы.
function NotificationsPanelPreview() {
  const [state, setState] = useState<PanelState>('list');
  return (
    <Card className="flex flex-col gap-3">
      <p className="text-sm font-semibold">Окно уведомлений</p>
      <SegmentedControl
        size="sm"
        aria-label="Состояние окна уведомлений"
        value={state}
        onValueChange={(value) => setState(value as PanelState)}
        options={[
          { value: 'list', label: 'Список' },
          { value: 'empty', label: 'Пусто' },
          { value: 'error', label: 'Ошибка' },
          { value: 'loading', label: 'Загрузка' },
        ]}
      />
      <div
        className={cn(popoverContentClassName, 'w-[22rem] max-w-full p-0')}
        data-testid="notifications-panel-preview"
      >
        <NotificationsPanel
          count={state === 'list' ? 2 : 0}
          items={state === 'list' ? DEMO_NOTIFICATIONS : state === 'empty' ? [] : undefined}
          state={state === 'error' ? 'error' : state === 'loading' ? 'loading' : 'ready'}
        />
      </div>
    </Card>
  );
}
