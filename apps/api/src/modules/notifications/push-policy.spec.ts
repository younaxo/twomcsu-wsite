import { NotificationsGateway } from './notifications.gateway';
import {
  buildPushPayload,
  safeInternalPath,
  shouldSendPush,
} from './push-policy';

const message = {
  id: 'n1',
  type: 'MESSAGE_RECEIVED',
  title: 'Новое сообщение от younaxo_',
  message: 'Привет, зайди на сервер — у нас ивент через десять минут',
  link: '/messages/c1',
  metadata: { conversationId: 'c1', messageId: 'm1' },
};

describe('push-policy', () => {
  it('push только в фоне: открытая вкладка, тихие часы, выключено, уже отправлено — нет', () => {
    const base = {
      pushEnabled: true,
      suppressed: false,
      foreground: false,
      alreadySent: false,
    };
    expect(shouldSendPush(base)).toBe(true);
    expect(shouldSendPush({ ...base, foreground: true })).toBe(false);
    expect(shouldSendPush({ ...base, suppressed: true })).toBe(false);
    expect(shouldSendPush({ ...base, pushEnabled: false })).toBe(false);
    expect(shouldSendPush({ ...base, alreadySent: true })).toBe(false);
  });

  it('превью включено — отправитель и короткий текст; tag беседы против дублей', () => {
    const payload = buildPushPayload(message, {
      previewEnabled: true,
      senderName: 'younaxo_',
    });
    expect(payload).toMatchObject({
      id: 'n1',
      tag: 'msg:c1',
      title: 'TwoMC · younaxo_',
      body: 'Привет, зайди на сервер — у нас ивент через десять минут',
    });
  });

  it('превью выключено — ни имени, ни текста в payload (сервер их не отправляет)', () => {
    const payload = buildPushPayload(message, {
      previewEnabled: false,
      senderName: 'younaxo_',
    });
    expect(payload.title).toBe('TwoMC');
    expect(payload.body).toBe('Новое сообщение');
    expect(JSON.stringify(payload)).not.toContain('younaxo_');
    expect(JSON.stringify(payload)).not.toContain('Привет');
  });

  it('длинный текст — обрезается до короткого превью', () => {
    const payload = buildPushPayload(
      { ...message, message: 'а'.repeat(500) },
      { previewEnabled: true, senderName: null },
    );
    expect(payload.title).toBe('TwoMC');
    expect(payload.body!.length).toBeLessThanOrEqual(120);
  });

  it('URL — только внутренний путь; push о сообщении ведёт в беседу (срез 2.4)', () => {
    expect(safeInternalPath('/u/younaxo')).toBe('/u/younaxo');
    expect(safeInternalPath('https://evil.example')).toBe('/notifications');
    expect(safeInternalPath('//evil.example/x')).toBe('/notifications');
    expect(safeInternalPath('/\\evil')).toBe('/notifications');
    expect(safeInternalPath(null)).toBe('/notifications');
    expect(
      buildPushPayload(message, { previewEnabled: true, senderName: null }).url,
    ).toBe(message.link);
  });
});

describe('NotificationsGateway: видимость вкладок', () => {
  const gateway = new NotificationsGateway(
    {} as never,
    {} as never,
    {} as never,
  );
  const socket = (id: string, userId: string) =>
    ({ id, data: { userId } }) as never;

  it('видимая вкладка — foreground; все скрыты или закрыты — фон', () => {
    gateway.onVisibility(socket('s1', 'u1'), { visible: true });
    gateway.onVisibility(socket('s2', 'u1'), { visible: false });
    expect(gateway.isForeground('u1')).toBe(true);
    gateway.onVisibility(socket('s1', 'u1'), { visible: false });
    expect(gateway.isForeground('u1')).toBe(false);
    gateway.onVisibility(socket('s1', 'u1'), { visible: true });
    gateway.handleDisconnect(socket('s1', 'u1'));
    expect(gateway.isForeground('u1')).toBe(false);
    expect(gateway.isForeground('nobody')).toBe(false);
  });
});
