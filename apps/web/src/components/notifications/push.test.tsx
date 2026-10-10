import type { NotificationDto, NotificationSettingsDto } from '@twomc/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NotificationSettingsPage from '@/app/(site)/settings/notifications/page';
import { NotificationsPushSection } from '@/app/design-lab/sections/notifications-push-section';
import {
  PUSH_ONBOARDING_DELAY_MS,
  PushCoachmark,
  pushOnboardingSnoozed,
  usePushOnboarding,
} from '@/components/notifications/push-onboarding';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useAuthStore } from '@/lib/auth/store';
import {
  inAppDecision,
  inAppLink,
  notificationHref,
  type InAppContext,
} from '@/lib/notifications/in-app';
import { deviceName, urlBase64ToUint8Array } from '@/lib/notifications/push';
import { NOTIFICATION_VOLUME_QUIET, notificationSound } from '@/lib/notifications/sound';
import { useOnboardingQueue } from '@/lib/onboarding';
import { installFetchMock, jsonResponse, requestInfo, type FetchMock } from '@/test/http';

/// Блок N (ADR-0097): разрешение браузера — только по нажатию, «Не сейчас»,
/// заблокировано → «Как включить», политика уведомлений при открытом сайте,
/// звук без повторов, «Настройки → Уведомления».

const device = vi.hoisted(() => ({
  permission: 'default' as 'default' | 'granted' | 'denied' | 'unsupported',
  request: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  subscribed: false,
}));

vi.mock('@/lib/notifications/push', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/notifications/push')>()),
  pushSupported: () => device.permission !== 'unsupported',
  pushPermission: () => device.permission,
  requestPushPermission: device.request,
  subscribeThisDevice: device.subscribe,
  unsubscribeThisDevice: device.unsubscribe,
  thisDeviceSubscribed: async () => device.subscribed,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/settings/notifications',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const SETTINGS: NotificationSettingsDto = {
  pushEnabled: false,
  soundEnabled: true,
  pushPreview: true,
  foregroundEnabled: true,
  emailEnabled: false,
  quietHoursEnabled: false,
  quietHoursStart: null,
  quietHoursEnd: null,
  typeSettings: {},
  discordEnabled: false,
  discordWebhookHint: null,
  digestMode: 'INSTANT',
  digestTime: '09:00',
  emailAvailable: false,
};

function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <TooltipProvider delayDuration={0}>{children}</TooltipProvider>
    </QueryClientProvider>
  );
}

let fetchMock: FetchMock;
const calls: string[] = [];

function serve({ configured = true, settings = SETTINGS } = {}) {
  fetchMock.mockImplementation(async (...args) => {
    const { path, method, body } = requestInfo(args);
    calls.push(`${method} ${path}`);
    if (path === '/notifications/push/vapid-key') {
      return jsonResponse({ publicKey: configured ? 'BPk' : null, configured });
    }
    if (path === '/notifications/settings' && method === 'PATCH') {
      return jsonResponse({ ...settings, ...JSON.parse(body ?? '{}') });
    }
    if (path === '/notifications/settings') return jsonResponse(settings);
    if (path === '/notifications/push/subscriptions') return jsonResponse([]);
    return jsonResponse({});
  });
}

beforeEach(() => {
  calls.length = 0;
  fetchMock = installFetchMock();
  serve();
  device.permission = 'default';
  device.subscribed = false;
  device.request.mockReset();
  device.subscribe.mockReset().mockResolvedValue({ ok: true });
  device.unsubscribe.mockReset().mockResolvedValue(undefined);
  localStorage.clear();
  sessionStorage.clear();
  useOnboardingQueue.setState({ active: null });
  useAuthStore.setState({
    status: 'authenticated',
    user: { id: 'me', username: 'player' } as never,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function Onboarding() {
  const onboarding = usePushOnboarding();
  if (!onboarding.open) return null;
  return (
    <PushCoachmark
      step={onboarding.step}
      pending={onboarding.pending}
      onAllow={() => void onboarding.allow()}
      onLater={onboarding.later}
      onHelp={() => onboarding.setHelp(true)}
    />
  );
}

async function showOnboarding() {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  render(<Onboarding />, { wrapper: Providers });
  await waitFor(() => expect(calls).toContain('GET /notifications/push/vapid-key'));
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    vi.advanceTimersByTime(PUSH_ONBOARDING_DELAY_MS + 50);
  });
}

describe('Onboarding разрешения уведомлений', () => {
  it('показывается после паузы; системный запрос — только по «Разрешить»', async () => {
    device.request.mockResolvedValue('granted');
    await showOnboarding();
    const allow = await screen.findByRole('button', { name: 'Разрешить' });
    expect(device.request).not.toHaveBeenCalled();
    expect(useOnboardingQueue.getState().active).toBe('notifications');

    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(allow);
    await waitFor(() => expect(device.subscribe).toHaveBeenCalledTimes(1));
    expect(device.request).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Разрешить' })).toBeNull());
    expect(useOnboardingQueue.getState().active).toBeNull();
  });

  it('«Не сейчас» — закрыть и не показывать 14 дней, без системного запроса', async () => {
    await showOnboarding();
    await userEvent
      .setup({ advanceTimers: vi.advanceTimersByTime })
      .click(await screen.findByRole('button', { name: 'Не сейчас' }));
    expect(screen.queryByRole('button', { name: 'Разрешить' })).toBeNull();
    expect(device.request).not.toHaveBeenCalled();
    expect(pushOnboardingSnoozed()).toBe(true);
    expect(pushOnboardingSnoozed(Date.now() + 15 * 86_400_000)).toBe(false);
  });

  it('браузер заблокировал → шаг «Как включить», повторно не спрашиваем', async () => {
    device.request.mockResolvedValue('denied');
    await showOnboarding();
    await userEvent
      .setup({ advanceTimers: vi.advanceTimersByTime })
      .click(await screen.findByRole('button', { name: 'Разрешить' }));
    expect(await screen.findByRole('button', { name: 'Как включить' })).toBeInTheDocument();
    expect(device.subscribe).not.toHaveBeenCalled();
  });

  it('не показывается, если разрешение браузера уже решено', async () => {
    device.permission = 'granted';
    await showOnboarding();
    expect(screen.queryByRole('button', { name: 'Разрешить' })).toBeNull();
  });

  it('не показывается, пока действует «Не сейчас»', async () => {
    localStorage.setItem('twomc.push-onboarding.snoozed-until', String(Date.now() + 86_400_000));
    await showOnboarding();
    expect(screen.queryByRole('button', { name: 'Разрешить' })).toBeNull();
  });

  it('очередь: подсказка регистрации важнее — уведомления ждут', async () => {
    useOnboardingQueue.setState({ active: 'registration' });
    await showOnboarding();
    expect(screen.queryByRole('button', { name: 'Разрешить' })).toBeNull();
    expect(useOnboardingQueue.getState().claim('notifications')).toBe(false);
    useOnboardingQueue.getState().release('registration');
    expect(useOnboardingQueue.getState().claim('notifications')).toBe(true);
    // Регистрация вытесняет подсказку уведомлений.
    expect(useOnboardingQueue.getState().claim('registration')).toBe(true);
  });

  it('push не настроен на сервере — без подсказки', async () => {
    serve({ configured: false });
    await showOnboarding();
    expect(screen.queryByRole('button', { name: 'Разрешить' })).toBeNull();
  });
});

const message = {
  id: 'm1',
  type: 'MESSAGE_RECEIVED',
  title: 'Новое сообщение',
  message: 'Привет',
  link: '/messages/c1',
  actionUrl: null,
  fromUser: { id: 'friend' },
  metadata: { conversationId: 'c1', messageId: 'msg1' },
} as unknown as NotificationDto;

const ctx = (patch: Partial<InAppContext> = {}): InAppContext => ({
  visible: true,
  meId: 'me',
  foregroundEnabled: true,
  soundEnabled: true,
  messagesEnabled: true,
  activeConversationId: null,
  seen: () => false,
  ...patch,
});

describe('Уведомления при открытом сайте (без дублей)', () => {
  it('сайт активен, другая страница → тост и звук', () => {
    expect(inAppDecision(message, ctx())).toEqual({ toast: true, sound: 'normal' });
  });

  it('открыт этот же диалог → без тоста, тихий звук', () => {
    expect(inAppDecision(message, ctx({ activeConversationId: 'c1' }))).toEqual({
      toast: false,
      sound: 'quiet',
    });
  });

  it('вкладка в фоне → ничего в интерфейсе (доставит системный push)', () => {
    expect(inAppDecision(message, ctx({ visible: false }))).toEqual({ toast: false, sound: null });
  });

  it('своё сообщение, повтор id, выключенные сообщения → ничего', () => {
    const nothing = { toast: false, sound: null };
    expect(inAppDecision(message, ctx({ meId: 'friend' }))).toEqual(nothing);
    expect(inAppDecision(message, ctx({ seen: (id) => id === 'm1' }))).toEqual(nothing);
    expect(inAppDecision(message, ctx({ messagesEnabled: false }))).toEqual(nothing);
    expect(inAppDecision({ ...message, type: 'FRIEND_REQUEST' }, ctx())).toEqual(nothing);
  });

  it('тосты выключены → ничего; звук выключен → только тост', () => {
    expect(inAppDecision(message, ctx({ foregroundEnabled: false }))).toEqual({
      toast: false,
      sound: null,
    });
    expect(inAppDecision(message, ctx({ soundEnabled: false }))).toEqual({
      toast: true,
      sound: null,
    });
  });

  it('ссылка: беседа (раздел выпущен, срез 2.4); внешние адреса → Центр уведомлений', () => {
    expect(inAppLink(message)).toBe('/messages/c1');
    expect(inAppLink({ link: 'https://evil.example', actionUrl: null })).toBe('/notifications');
    expect(inAppLink({ link: '//evil.example', actionUrl: null })).toBe('/notifications');
    expect(inAppLink({ link: '/friends', actionUrl: null })).toBe('/friends');
  });

  it('пункт списка: ссылка на беседу ведёт в «Сообщения»', () => {
    expect(notificationHref(message)).toBe('/messages/c1');
    expect(notificationHref({ link: null, actionUrl: null })).toBeNull();
    expect(notificationHref({ link: '/friends', actionUrl: null })).toBe('/friends');
    expect(notificationHref({ link: '/friends', actionUrl: '/store/orders/1' })).toBe(
      '/store/orders/1',
    );
  });
});

describe('Звук уведомлений', () => {
  it('один id — один звук; превью в настройках играет всегда', () => {
    const play = vi.fn(async () => undefined);
    const created: Array<{ volume: number }> = [];
    vi.stubGlobal(
      'Audio',
      class {
        preload = '';
        volume = 1;
        currentTime = 0;
        play = play;
        constructor() {
          created.push(this);
        }
      },
    );
    notificationSound.resetForTests();
    expect(notificationSound.play('m1')).toBe(true);
    expect(notificationSound.play('m1')).toBe(false);
    expect(notificationSound.play('m2', { quiet: true })).toBe(true);
    expect(created[0]?.volume).toBe(NOTIFICATION_VOLUME_QUIET);
    notificationSound.preview();
    notificationSound.preview();
    expect(play).toHaveBeenCalledTimes(4);
    expect(created).toHaveLength(1);
    notificationSound.resetForTests();
  });
});

describe('Помощники Web Push', () => {
  it('VAPID base64url → байты; короткое имя устройства без отпечатка', () => {
    expect(Array.from(urlBase64ToUint8Array('AQID_-8'))).toEqual([1, 2, 3, 255, 239]);
    expect(
      deviceName(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36 Edg/141.0',
      ),
    ).toBe('Edge · Windows');
    expect(
      deviceName('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0'),
    ).toBe('Chrome · Windows');
    expect(deviceName('curl/8')).toBe('Браузер');
  });
});

describe('Design Lab: уведомления и push', () => {
  it('подсказка в обоих шагах и «Как включить» — без системного запроса', async () => {
    const user = userEvent.setup();
    render(<NotificationsPushSection />, { wrapper: Providers });
    const preview = screen.getByTestId('push-coachmark-preview');
    expect(within(preview).getByRole('button', { name: 'Разрешить' })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Заблокировано' }));
    await user.click(within(preview).getByRole('button', { name: 'Как включить' }));
    expect(
      await screen.findByRole('dialog', { name: 'Как включить уведомления' }),
    ).toBeInTheDocument();
    expect(device.request).not.toHaveBeenCalled();
    expect(device.subscribe).not.toHaveBeenCalled();
  });
});

describe('Настройки → Уведомления', () => {
  it('разрешение не запрошено: запрос только по переключателю, затем подписка', async () => {
    const user = userEvent.setup();
    device.request.mockImplementation(async () => {
      device.permission = 'granted';
      return 'granted';
    });
    serve();
    render(<NotificationSettingsPage />, { wrapper: Providers });
    expect(await screen.findByTestId('push-permission')).toHaveTextContent('Не запрошено');
    const toggle = await screen.findByRole('switch', {
      name: /Push-уведомления на этом устройстве/,
    });
    expect(device.request).not.toHaveBeenCalled();
    await user.click(toggle);
    await waitFor(() => expect(device.subscribe).toHaveBeenCalledTimes(1));
    expect(device.request).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(calls).toContain('PATCH /notifications/settings'));
  });

  it('заблокировано в браузере → «Как включить» с инструкцией, без запроса', async () => {
    const user = userEvent.setup();
    device.permission = 'denied';
    serve();
    render(<NotificationSettingsPage />, { wrapper: Providers });
    // Реальное разрешение читается эффектом после первого рендера.
    await waitFor(() =>
      expect(screen.getByTestId('push-permission')).toHaveTextContent('Заблокировано'),
    );
    await user.click(await screen.findByRole('button', { name: 'Как включить' }));
    expect(
      await screen.findByRole('dialog', { name: 'Как включить уведомления' }),
    ).toBeInTheDocument();
    expect(device.request).not.toHaveBeenCalled();
  });

  it('разрешено и подписано → выключение отписывает только это устройство', async () => {
    const user = userEvent.setup();
    device.permission = 'granted';
    device.subscribed = true;
    serve({ settings: { ...SETTINGS, pushEnabled: true } });
    render(<NotificationSettingsPage />, { wrapper: Providers });
    const toggle = await screen.findByRole('switch', {
      name: /Push-уведомления на этом устройстве/,
    });
    await waitFor(() => expect(toggle).toBeChecked());
    await user.click(toggle);
    await waitFor(() => expect(device.unsubscribe).toHaveBeenCalledTimes(1));
  });

  it('сервер без VAPID — честно «пока не настроены», переключателя нет', async () => {
    serve({ configured: false });
    render(<NotificationSettingsPage />, { wrapper: Providers });
    expect(await screen.findByTestId('push-not-configured')).toBeInTheDocument();
    expect(
      screen.queryByRole('switch', { name: /Push-уведомления на этом устройстве/ }),
    ).toBeNull();
  });

  it('предпросмотр, звук и тосты сохраняются на сервере', async () => {
    const user = userEvent.setup();
    serve();
    render(<NotificationSettingsPage />, { wrapper: Providers });
    await user.click(await screen.findByRole('switch', { name: /Предпросмотр сообщения/ }));
    await waitFor(() => {
      const patch = fetchMock.mock.calls
        .map((call) => requestInfo(call))
        .find((info) => info.method === 'PATCH');
      expect(JSON.parse(patch?.body ?? '{}')).toEqual({ pushPreview: false });
    });
  });
});
