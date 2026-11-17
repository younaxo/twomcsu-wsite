import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DefaultReportPriorityProvider } from './report-priority.provider';
import { ReportsModerationService } from './reports-moderation.service';

function setup() {
  const prisma = {
    report: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      update: jest
        .fn()
        .mockImplementation(({ data }) => ({ id: 'r1', ...data })),
    },
    user: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    reportModeratorNote: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    auditLog: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    reportMessage: { create: jest.fn().mockResolvedValue({}) },
  };
  const permissions = { hasPermission: jest.fn().mockResolvedValue(true) };
  const notifications = { create: jest.fn().mockResolvedValue({}) };
  const service = new ReportsModerationService(
    prisma as never,
    permissions as never,
    notifications as never,
    new DefaultReportPriorityProvider(),
  );
  return { prisma, permissions, notifications, service };
}

const row = (extra: Record<string, unknown> = {}) => ({
  id: 'r1',
  reportNumber: 'R-1',
  type: 'OTHER',
  status: 'PENDING',
  authorId: 'author',
  isLocked: false,
  ...extra,
});

const whereOf = (prisma: ReturnType<typeof setup>['prisma']) =>
  prisma.report.findMany.mock.calls[0][0].where;

describe('ReportsModerationService.listModeration: фильтры', () => {
  it('без фильтров — только неархивные', async () => {
    const { prisma, service } = setup();
    await service.listModeration({}, 'staff');
    expect(whereOf(prisma)).toEqual({ isArchived: false });
  });

  it('status + type + priority пересекаются через типы', async () => {
    const { prisma, service } = setup();
    await service.listModeration(
      { status: 'PENDING', type: 'DONATION_PROBLEM', priority: 'HIGH' },
      'staff',
    );
    expect(whereOf(prisma).AND).toEqual([
      { status: 'PENDING' },
      { type: { in: ['DONATION_PROBLEM'] } },
    ]);
  });

  it('priority без type — набор типов приоритета', async () => {
    const { prisma, service } = setup();
    await service.listModeration({ priority: 'HIGH' }, 'staff');
    const clause = whereOf(prisma).AND[0].type.in as string[];
    expect(clause.sort()).toEqual([
      'ADMIN_COMPLAINT',
      'DONATION_PROBLEM',
      'PUNISHMENT_APPEAL',
    ]);
  });

  it('priority несовместим с type — пустой набор (ничего не найдено)', async () => {
    const { prisma, service } = setup();
    await service.listModeration({ priority: 'HIGH', type: 'OTHER' }, 'staff');
    expect(whereOf(prisma).AND[0]).toEqual({ type: { in: [] } });
  });

  it('assignedToId: me, unassigned и конкретный id', async () => {
    const { prisma, service } = setup();
    await service.listModeration({ assignedToId: 'me' }, 'staff-1');
    expect(whereOf(prisma).AND).toEqual([{ assignedToId: 'staff-1' }]);

    prisma.report.findMany.mockClear();
    await service.listModeration({ assignedToId: 'unassigned' }, 'staff-1');
    expect(whereOf(prisma).AND).toEqual([{ assignedToId: null }]);

    prisma.report.findMany.mockClear();
    await service.listModeration({ assignedToId: 'user-9' }, 'staff-1');
    expect(whereOf(prisma).AND).toEqual([{ assignedToId: 'user-9' }]);
  });

  it('q: ищет по номеру, описанию, нику цели и нику автора без учёта регистра', async () => {
    const { prisma, service } = setup();
    await service.listModeration({ q: 'Steve' }, 'staff');
    const contains = { contains: 'Steve', mode: 'insensitive' };
    expect(whereOf(prisma).AND[0].OR).toEqual([
      { reportNumber: contains },
      { description: contains },
      { targets: { some: { username: contains } } },
      { author: { username: contains } },
    ]);
  });

  it('элементы получают вычисляемый priority, автор — публичные поля', async () => {
    const { prisma, service } = setup();
    prisma.report.findMany.mockResolvedValue([
      row({ type: 'PUNISHMENT_APPEAL' }),
      row({ id: 'r2', type: 'OTHER' }),
    ]);
    const res = await service.listModeration({}, 'staff');
    expect(res.items.map((i) => i.priority)).toEqual(['HIGH', 'NORMAL']);
    const include = prisma.report.findMany.mock.calls[0][0].include;
    expect(Object.keys(include.author.select).sort()).toEqual([
      'avatar',
      'id',
      'tag',
      'username',
    ]);
  });
});

describe('ReportsModerationService.assign', () => {
  it('назначает исполнителя с reports.view и уведомляет его', async () => {
    const { prisma, notifications, service } = setup();
    prisma.report.findUnique.mockResolvedValue(row());
    prisma.user.findUnique.mockResolvedValue({ id: 'm2', isBanned: false });
    await service.assign('R-1', { assignedToId: 'm2' }, 'm1');
    expect(prisma.report.update.mock.calls[0][0].data).toEqual({
      assignedToId: 'm2',
    });
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'm2', type: 'REPORT_ASSIGNED' }),
    );
  });

  it('несуществующий исполнитель — 404', async () => {
    const { prisma, service } = setup();
    prisma.report.findUnique.mockResolvedValue(row());
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(
      service.assign('R-1', { assignedToId: 'x' }, 'm1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('заблокированный исполнитель — 400', async () => {
    const { prisma, service } = setup();
    prisma.report.findUnique.mockResolvedValue(row());
    prisma.user.findUnique.mockResolvedValue({ id: 'm2', isBanned: true });
    await expect(
      service.assign('R-1', { assignedToId: 'm2' }, 'm1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('исполнитель без reports.view — 400', async () => {
    const { prisma, permissions, service } = setup();
    prisma.report.findUnique.mockResolvedValue(row());
    prisma.user.findUnique.mockResolvedValue({ id: 'm2', isBanned: false });
    permissions.hasPermission.mockResolvedValue(false);
    await expect(
      service.assign('R-1', { assignedToId: 'm2' }, 'm1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.report.update).not.toHaveBeenCalled();
  });

  it('снятие исполнителя не проверяет права и не уведомляет', async () => {
    const { prisma, permissions, notifications, service } = setup();
    prisma.report.findUnique.mockResolvedValue(row());
    await service.assign('R-1', {}, 'm1');
    expect(permissions.hasPermission).not.toHaveBeenCalled();
    expect(notifications.create).not.toHaveBeenCalled();
    expect(prisma.report.update.mock.calls[0][0].data).toEqual({
      assignedToId: null,
    });
  });

  it('самоназначение не шлёт уведомление', async () => {
    const { prisma, notifications, service } = setup();
    prisma.report.findUnique.mockResolvedValue(row());
    prisma.user.findUnique.mockResolvedValue({ id: 'm1', isBanned: false });
    await service.assign('R-1', { assignedToId: 'm1' }, 'm1');
    expect(notifications.create).not.toHaveBeenCalled();
  });
});

describe('ReportsModerationService: уведомления автору', () => {
  it('смена статуса уведомляет автора со ссылкой на обращение', async () => {
    const { prisma, notifications, service } = setup();
    prisma.report.findUnique.mockResolvedValue(row());
    await service.changeStatus('R-1', { status: 'IN_REVIEW' }, 'm1');
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'author',
        link: '/support/R-1',
        type: 'REPORT_STATUS_CHANGED',
      }),
    );
  });

  it('тот же статус — без уведомления', async () => {
    const { prisma, notifications, service } = setup();
    prisma.report.findUnique.mockResolvedValue(row({ status: 'IN_REVIEW' }));
    await service.changeStatus('R-1', { status: 'IN_REVIEW' }, 'm1');
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('сбой уведомления не ломает действие персонала', async () => {
    const { prisma, notifications, service } = setup();
    prisma.report.findUnique.mockResolvedValue(row());
    notifications.create.mockRejectedValue(new Error('ws down'));
    await expect(
      service.setVerdict('R-1', { verdict: 'Ок', status: 'RESOLVED' }, 'm1'),
    ).resolves.toMatchObject({ verdict: 'Ок' });
  });

  it('ответ персонала уведомляет автора; собственное обращение — нет', async () => {
    const { prisma, notifications, service } = setup();
    prisma.report.findUnique.mockResolvedValue(row());
    await service.addMessage('R-1', 'm1', { content: 'ответ' });
    expect(notifications.create).toHaveBeenCalledTimes(1);

    notifications.create.mockClear();
    await service.addMessage('R-1', 'author', { content: 'сам себе' });
    expect(notifications.create).not.toHaveBeenCalled();
  });
});

describe('ReportsModerationService.history', () => {
  it('читает AuditLog по id обращения, без IP/User-Agent, актор — публичные поля', async () => {
    const { prisma, service } = setup();
    prisma.report.findUnique.mockResolvedValue(row());
    prisma.auditLog.count.mockResolvedValue(1);
    const res = await service.history('R-1', { page: 2, limit: 10 });
    const arg = prisma.auditLog.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({
      targetId: 'r1',
      targetType: { in: ['reports', 'report'] },
    });
    expect(arg.select.ipAddress).toBeUndefined();
    expect(arg.select.userAgent).toBeUndefined();
    expect(Object.keys(arg.select.actor.select).sort()).toEqual([
      'avatar',
      'id',
      'tag',
      'username',
    ]);
    expect(arg.skip).toBe(10);
    expect(arg.take).toBe(10);
    expect(arg.orderBy).toEqual({ createdAt: 'desc' });
    expect(res).toMatchObject({ total: 1, page: 2, limit: 10 });
  });

  it('несуществующее обращение — 404', async () => {
    const { prisma, service } = setup();
    prisma.report.findUnique.mockResolvedValue(null);
    await expect(service.history('X', {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('ReportsModerationService.assignableStaff', () => {
  it('фильтр: не забанен, не SYSTEM, reports.view через роль или superuser, публичные поля', async () => {
    const { prisma, permissions, service } = setup();
    prisma.user.findMany.mockResolvedValue([{ id: 'u1', username: 'Mod' }]);
    const res = await service.assignableStaff({});
    const arg = prisma.user.findMany.mock.calls[0][0];
    expect(arg.where.isBanned).toBe(false);
    expect(arg.where.accountType).toEqual({ not: 'SYSTEM' });
    expect(arg.where.username).toBeUndefined();
    expect(arg.where.roles.some.role.OR).toEqual([
      { isSuperuser: true },
      {
        permissions: {
          some: { effect: 'ALLOW', permission: { key: 'reports.view' } },
        },
      },
    ]);
    expect(Object.keys(arg.select).sort()).toEqual([
      'avatar',
      'id',
      'tag',
      'username',
    ]);
    expect(arg.take).toBe(20);
    expect(res.items).toHaveLength(1);
    // Выборка одним запросом, без поштучных проверок прав.
    expect(permissions.hasPermission).not.toHaveBeenCalled();
  });

  it('q — поиск по нику без регистра, limit передаётся', async () => {
    const { prisma, service } = setup();
    await service.assignableStaff({ q: '  Ste ', limit: 5 });
    const arg = prisma.user.findMany.mock.calls[0][0];
    expect(arg.where.username).toEqual({
      contains: 'Ste',
      mode: 'insensitive',
    });
    expect(arg.take).toBe(5);
  });
});

describe('ReportsModerationService.updateModeratorNote: права', () => {
  const note = { id: 'n1', reportId: 'r1', authorId: 'author-mod' };

  it('автор заметки правит без дополнительной проверки права', async () => {
    const { prisma, permissions, service } = setup();
    prisma.report.findUnique.mockResolvedValue(row());
    prisma.reportModeratorNote.findUnique.mockResolvedValue(note);
    await service.updateModeratorNote(
      'R-1',
      'n1',
      { content: 'x' },
      'author-mod',
    );
    expect(permissions.hasPermission).not.toHaveBeenCalled();
    expect(prisma.reportModeratorNote.update).toHaveBeenCalledTimes(1);
  });

  it('чужая заметка без reports.delete — 403, без записи', async () => {
    const { prisma, permissions, service } = setup();
    prisma.report.findUnique.mockResolvedValue(row());
    prisma.reportModeratorNote.findUnique.mockResolvedValue(note);
    permissions.hasPermission.mockResolvedValue(false);
    await expect(
      service.updateModeratorNote('R-1', 'n1', { content: 'x' }, 'other'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(permissions.hasPermission).toHaveBeenCalledWith(
      'other',
      'reports.delete',
    );
    expect(prisma.reportModeratorNote.update).not.toHaveBeenCalled();
  });

  it('чужая заметка с reports.delete — правится', async () => {
    const { prisma, service } = setup();
    prisma.report.findUnique.mockResolvedValue(row());
    prisma.reportModeratorNote.findUnique.mockResolvedValue(note);
    await service.updateModeratorNote('R-1', 'n1', { content: 'x' }, 'senior');
    expect(prisma.reportModeratorNote.update).toHaveBeenCalledTimes(1);
  });

  it('заметка другого обращения — 404', async () => {
    const { prisma, service } = setup();
    prisma.report.findUnique.mockResolvedValue(row());
    prisma.reportModeratorNote.findUnique.mockResolvedValue({
      ...note,
      reportId: 'r2',
    });
    await expect(
      service.updateModeratorNote('R-1', 'n1', { content: 'x' }, 'author-mod'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('unpin и ответы с заметками: закреплённые первыми, затем по времени', async () => {
    const { prisma, service } = setup();
    prisma.report.findUnique.mockResolvedValue(row());
    prisma.reportModeratorNote.findUnique.mockResolvedValue(note);
    await service.pinModeratorNote('R-1', 'n1', false);
    expect(prisma.reportModeratorNote.update.mock.calls[0][0].data).toEqual({
      isPinned: false,
    });
    const include = prisma.report.findUnique.mock.calls.at(-1)?.[0].include;
    expect(include.moderatorNotes.orderBy).toEqual([
      { isPinned: 'desc' },
      { createdAt: 'asc' },
    ]);
  });
});
