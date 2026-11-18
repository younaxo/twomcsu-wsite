import { NotificationsService } from './notifications.service';

const fromUser = { id: 'm1', username: 'moder', avatar: 'a.png' };

function setup() {
  const prisma = {
    notification: {
      findMany: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
  };
  const gateway = {
    emitToUser: jest.fn(),
    emitChanged: jest.fn(),
    isForeground: jest.fn().mockReturnValue(true),
  };
  const settings = {
    isTypeEnabled: jest.fn().mockResolvedValue(true),
    getOrCreate: jest.fn().mockResolvedValue({
      emailEnabled: false,
      pushEnabled: false,
      discordEnabled: false,
    }),
    isQuietHoursNow: jest.fn().mockReturnValue(false),
  };
  const storage = { publicUrl: jest.fn((v: string | null) => v) };
  const service = new NotificationsService(
    prisma as never,
    settings as never,
    gateway as never,
    {} as never,
    {} as never,
    storage as never,
    {} as never,
  );
  return { prisma, gateway, service };
}

const stored = (extra: Record<string, unknown>) => ({
  id: 'n1',
  userId: 'author',
  title: 't',
  message: null,
  isRead: false,
  priority: 'NORMAL',
  ...extra,
});

describe('NotificationsService: скрытие модератора в уведомлениях автору (R44)', () => {
  it('list: старые уведомления автора — fromUser/fromUserId = null; персонала — без изменений', async () => {
    const { prisma, service } = setup();
    prisma.notification.findMany.mockResolvedValue([
      stored({
        id: 'a',
        type: 'REPORT_STATUS_CHANGED',
        link: '/support/R-1',
        fromUserId: 'm1',
        fromUser,
      }),
      stored({
        id: 'b',
        type: 'SYSTEM',
        link: '/support/R-1',
        fromUserId: 'm1',
        fromUser,
      }),
      stored({
        id: 'c',
        type: 'REPORT_ASSIGNED',
        link: '/admin/reports/R-1',
        fromUserId: 'm1',
        fromUser,
      }),
    ]);
    const res = await service.list('author', 1, 20);
    expect(res.items[0]).toMatchObject({ fromUserId: null, fromUser: null });
    expect(res.items[1]).toMatchObject({ fromUserId: null, fromUser: null });
    expect(res.items[2]).toMatchObject({
      fromUserId: 'm1',
      fromUser: { id: 'm1', username: 'moder' },
    });
    expect(JSON.stringify(res.items.slice(0, 2))).not.toContain('moder');
  });

  it('markRead и markUnread не отдают fromUserId модератора', async () => {
    const { prisma, service } = setup();
    const row = stored({
      type: 'REPORT_VERDICT',
      link: '/support/R-1',
      fromUserId: 'm1',
    });
    prisma.notification.findUnique.mockResolvedValue(row);
    prisma.notification.update.mockResolvedValue({ ...row, isRead: true });
    expect(await service.markRead('author', 'n1')).toMatchObject({
      fromUserId: null,
    });
    expect(await service.markUnread('author', 'n1')).toMatchObject({
      fromUserId: null,
    });
  });

  it('create: WS получает уведомление без fromUserId, даже если вызывающий его передал', async () => {
    const { prisma, gateway, service } = setup();
    prisma.notification.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'n1', ...data }),
    );
    await service.create({
      userId: 'author',
      type: 'REPORT_VERDICT' as never,
      title: 't',
      link: '/support/R-1',
      fromUserId: 'm1',
    });
    expect(gateway.emitToUser.mock.calls[0][1]).toMatchObject({
      fromUserId: null,
    });
  });
});
