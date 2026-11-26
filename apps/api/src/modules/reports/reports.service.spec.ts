import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { CreateReportDto } from './dto/create-report.dto';
import {
  REPORT_CREATE_LIMIT,
  REPORT_CREATE_WINDOW_MS,
  REPORT_MESSAGE_LIMIT,
  REPORT_MESSAGE_WINDOW_MS,
} from './report-constants';
import { DefaultReportPriorityProvider } from './report-priority.provider';
import { ReportsService } from './reports.service';

type Mock = jest.Mock;

function setup() {
  /// Журнал обращений к БД: порядок вызовов и «кому» они адресованы.
  const calls: string[] = [];
  const prisma = {
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
    reportBan: { findFirst: jest.fn().mockResolvedValue(null) },
    user: { findMany: jest.fn().mockResolvedValue([]) },
    userPunishment: { findUnique: jest.fn() },
    report: {
      findUnique: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest
        .fn()
        .mockImplementation(({ data }) => ({ id: 'r1', ...data })),
    },
    auditLog: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    reportMessage: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  // В транзакции `tx` — отдельный объект: так видно, что проверки и создание
  // идут через него, а не через общий клиент.
  const tx = {
    $queryRaw: jest.fn().mockImplementation(() => {
      calls.push('tx.lock');
      return Promise.resolve([{ id: 'p1' }]);
    }),
    userPunishment: {
      findUnique: jest.fn().mockImplementation(() => {
        calls.push('tx.punishment.findUnique');
        return Promise.resolve(null);
      }),
    },
    report: {
      findFirst: jest.fn().mockImplementation(() => {
        calls.push('tx.report.findFirst');
        return Promise.resolve(null);
      }),
      create: jest.fn().mockImplementation(({ data }) => {
        calls.push('tx.report.create');
        return Promise.resolve({ id: 'r1', ...data });
      }),
    },
  };
  prisma.$transaction.mockImplementation((cb: (t: unknown) => unknown) =>
    cb(tx),
  );
  const audit = { logInTx: jest.fn().mockResolvedValue(undefined) };
  const service = new ReportsService(
    prisma as never,
    new DefaultReportPriorityProvider(),
    audit as never,
  );
  return { prisma, tx, calls, service, audit };
}

const appealDto = (extra: Partial<CreateReportDto> = {}): CreateReportDto =>
  ({
    type: 'PUNISHMENT_APPEAL',
    description: 'Прошу пересмотреть',
    appealedPunishmentId: 'p1',
    ...extra,
  }) as CreateReportDto;

const punishment = (extra: Record<string, unknown> = {}) => ({
  id: 'p1',
  userId: 'author',
  isAppealable: true,
  ...extra,
});

describe('ReportsService.createReport: обжалование наказания', () => {
  it('успех: пишет appealedPunishmentId, цели не требуются', async () => {
    const { prisma, tx, service } = setup();
    tx.userPunishment.findUnique.mockResolvedValue(punishment());
    prisma.report.findUnique.mockResolvedValue(null); // generateReportNumber
    await service.createReport('author', appealDto());
    const call = tx.report.create.mock.calls[0][0];
    expect(prisma.report.create).not.toHaveBeenCalled();
    expect(call.data.appealedPunishmentId).toBe('p1');
    expect(call.data.type).toBe('PUNISHMENT_APPEAL');
    expect(call.data.targets.create).toEqual([]);
    // Ответ не раскрывает issuedBy наказания.
    expect(call.include.appealedPunishment.select.issuedBy).toBeUndefined();
  });

  it('без appealedPunishmentId — 400', async () => {
    const { service } = setup();
    await expect(
      service.createReport(
        'author',
        appealDto({ appealedPunishmentId: undefined }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('чужое наказание — 404 (не раскрываем существование)', async () => {
    const { tx, service } = setup();
    tx.userPunishment.findUnique.mockResolvedValue(
      punishment({ userId: 'someone-else' }),
    );
    await expect(
      service.createReport('author', appealDto()),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.report.create).not.toHaveBeenCalled();
  });

  it('несуществующее наказание — 404', async () => {
    const { tx, service } = setup();
    tx.userPunishment.findUnique.mockResolvedValue(null);
    await expect(
      service.createReport('author', appealDto()),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('необжалуемое наказание — 400', async () => {
    const { tx, service } = setup();
    tx.userPunishment.findUnique.mockResolvedValue(
      punishment({ isAppealable: false }),
    );
    await expect(service.createReport('author', appealDto())).rejects.toThrow(
      'Это наказание нельзя обжаловать',
    );
  });

  it('дубль: открытое обращение по этому наказанию — 409', async () => {
    const { tx, service } = setup();
    tx.userPunishment.findUnique.mockResolvedValue(punishment());
    tx.report.findFirst.mockResolvedValue({ id: 'other' });
    await expect(
      service.createReport('author', appealDto()),
    ).rejects.toBeInstanceOf(ConflictException);
    const where = tx.report.findFirst.mock.calls[0][0].where;
    expect(where.appealedPunishmentId).toBe('p1');
    expect(where.status.notIn).toEqual(['RESOLVED', 'REJECTED', 'CLOSED']);
  });

  it('поле appealedPunishmentId для другого типа — 400', async () => {
    const { prisma, tx, service } = setup();
    await expect(
      service.createReport(
        'author',
        appealDto({ type: 'TECHNICAL_ISSUE', targets: [] }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.userPunishment.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('гонка: блокировка строки наказания -> проверки -> create, всё через tx', async () => {
    const { prisma, tx, calls, service } = setup();
    tx.userPunishment.findUnique.mockImplementationOnce(() => {
      calls.push('tx.punishment.findUnique');
      return Promise.resolve(punishment());
    });
    await service.createReport('author', appealDto());
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([
      'tx.lock',
      'tx.punishment.findUnique',
      'tx.report.findFirst',
      'tx.report.create',
    ]);
    // Блокировка — tagged template: строка SQL и параметр отдельно.
    const sql = tx.$queryRaw.mock.calls[0][0] as {
      strings: string[];
      values: unknown[];
    };
    expect(sql.strings.join('?')).toContain('"user_punishments"');
    expect(sql.strings.join('?')).toContain('FOR UPDATE');
    expect(sql.values).toEqual(['p1']);
    // Общий клиент в проверке и создании обжалования не участвует.
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.report.create).not.toHaveBeenCalled();
    expect(prisma.report.findFirst).not.toHaveBeenCalled();
  });

  it('гонка: при 409 после блокировки create не вызывается', async () => {
    const { tx, calls, service } = setup();
    tx.userPunishment.findUnique.mockImplementationOnce(() => {
      calls.push('tx.punishment.findUnique');
      return Promise.resolve(punishment());
    });
    tx.report.findFirst.mockImplementationOnce(() => {
      calls.push('tx.report.findFirst');
      return Promise.resolve({ id: 'first' });
    });
    await expect(
      service.createReport('author', appealDto()),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(calls).toEqual([
      'tx.lock',
      'tx.punishment.findUnique',
      'tx.report.findFirst',
    ]);
  });

  it('не-обжалование создаётся без транзакции и блокировки', async () => {
    const { prisma, tx, service } = setup();
    await service.createReport('author', {
      type: 'TECHNICAL_ISSUE',
      description: 'x',
    } as CreateReportDto);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.report.create).toHaveBeenCalledTimes(1);
  });

  it('жалоба без целей по-прежнему 400', async () => {
    const { service } = setup();
    await expect(
      service.createReport('author', {
        type: 'PLAYER_COMPLAINT',
        description: 'x',
      } as CreateReportDto),
    ).rejects.toThrow('Укажите ник нарушителя');
  });
});

const reportRow = (extra: Record<string, unknown> = {}) => ({
  id: 'r1',
  reportNumber: 'R-1',
  type: 'OTHER',
  status: 'IN_REVIEW',
  authorId: 'author',
  isLocked: false,
  internalNote: 'секрет персонала',
  moderatorNotes: [{ id: 'n1', content: 'заметка' }],
  messages: [],
  ...extra,
});

const STAFF_ONLY_REPORT_FIELDS = [
  'internalNote',
  'assignedToId',
  'lockedBy',
  'isArchived',
  'archivedAt',
  'archivedBy',
  'archiveReason',
  'punishmentType',
  'punishmentDuration',
  'punishmentReason',
];

describe('ReportsService: приватность служебных полей', () => {
  it('getByNumber: автор — omit служебных полей, без заметок и priority', async () => {
    const { prisma, service } = setup();
    prisma.report.findUnique.mockResolvedValue(reportRow());
    const res = (await service.getByNumber('R-1', 'author', false)) as Record<
      string,
      unknown
    >;
    expect(res.priority).toBeUndefined();
    const arg = prisma.report.findUnique.mock.calls[0][0];
    for (const field of STAFF_ONLY_REPORT_FIELDS) {
      expect(arg.omit[field]).toBe(true);
    }
    expect(arg.include.targets.omit).toEqual({ userId: true });
    expect(arg.include.attachments.omit).toEqual({ uploadedBy: true });
    expect(arg.include.messages.omit).toEqual({
      deletedAt: true,
      deletedBy: true,
      deleteReason: true,
      pinnedBy: true,
      pinnedAt: true,
    });
    expect(arg.include.messages.include.attachments).toEqual({
      omit: { uploadedBy: true },
    });
    expect(arg.include.moderatorNotes).toBeUndefined();
    expect(arg.include.author).toBeUndefined();
    expect(arg.include.assignedTo).toBeUndefined();
    expect(arg.include.messages.where).toEqual({ isDeleted: false });
  });

  it('getByNumber: персонал — без omit, с priority, заметками и исполнителем', async () => {
    const { prisma, service } = setup();
    prisma.report.findUnique.mockResolvedValue(
      reportRow({ type: 'DONATION_PROBLEM' }),
    );
    const res = (await service.getByNumber('R-1', 'staff', true)) as Record<
      string,
      unknown
    >;
    expect(res.internalNote).toBe('секрет персонала');
    expect(res.priority).toBe('HIGH');
    const arg = prisma.report.findUnique.mock.calls[0][0];
    expect(arg.omit).toBeUndefined();
    expect(arg.include.messages.omit).toBeUndefined();
    expect(arg.include.messages.include.attachments).toBe(true);
    expect(arg.include.targets).toBe(true);
    expect(arg.include.moderatorNotes).toEqual({
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'asc' }],
    });
    expect(arg.include.assignedTo).toBeDefined();
  });

  it('getByNumber: чужой игрок — 403', async () => {
    const { prisma, service } = setup();
    prisma.report.findUnique.mockResolvedValue(reportRow());
    await expect(
      service.getByNumber('R-1', 'stranger', false),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('getByNumber: персонал без 2FA, чужое обращение — 403 admin_2fa_required', async () => {
    const { prisma, service } = setup();
    prisma.report.findUnique.mockResolvedValue(reportRow());
    await expect(
      service.getByNumber('R-1', 'staff', false, true),
    ).rejects.toMatchObject({
      response: { code: 'admin_2fa_required' },
      status: 403,
    });
  });

  it('getByNumber: автор без 2FA (персонал) — своё обращение доступно как игроку', async () => {
    const { prisma, service } = setup();
    prisma.report.findUnique.mockResolvedValue(reportRow());
    const res = await service.getByNumber('R-1', 'author', false, true);
    expect(res).toBeDefined();
  });

  it('listMine: omit служебных полей и userId целей, фильтр только по автору', async () => {
    const { prisma, service } = setup();
    await service.listMine('author', { status: 'PENDING' });
    const arg = prisma.report.findMany.mock.calls[0][0];
    for (const field of STAFF_ONLY_REPORT_FIELDS) {
      expect(arg.omit[field]).toBe(true);
    }
    expect(arg.include.targets.omit).toEqual({ userId: true });
    expect(arg.where).toEqual({ authorId: 'author', status: 'PENDING' });
  });

  it('createReport/createDonationProblem: ответ игроку с omit служебных полей', async () => {
    const { prisma, service } = setup();
    await service.createReport('author', {
      type: 'TECHNICAL_ISSUE',
      description: 'x',
    } as CreateReportDto);
    await service.createDonationProblem('author', {
      description: 'не пришла покупка',
    } as never);
    expect(prisma.report.create).toHaveBeenCalledTimes(2);
    for (const [arg] of prisma.report.create.mock.calls) {
      for (const field of STAFF_ONLY_REPORT_FIELDS) {
        expect(arg.omit[field]).toBe(true);
      }
    }
    expect(prisma.report.create.mock.calls[0][0].include.targets.omit).toEqual({
      userId: true,
    });
  });

  it('addMessage/updateOwnMessage: ответ строится через getByNumber игрока', async () => {
    const { prisma, service } = setup();
    prisma.report.findUnique.mockResolvedValue(reportRow());
    await service.addMessage('R-1', 'author', { content: 'привет' });
    prisma.reportMessage.findUnique.mockResolvedValue({
      id: 'm1',
      reportId: 'r1',
      authorId: 'author',
      isDeleted: false,
      isStaff: false,
    });
    await service.updateOwnMessage('R-1', 'author', 'm1', {
      content: 'правка',
    });
    const calls = prisma.report.findUnique.mock.calls.filter(
      ([arg]) => arg.include,
    );
    expect(calls.length).toBeGreaterThanOrEqual(2);
    for (const [arg] of calls) {
      expect(arg.omit.internalNote).toBe(true);
      expect(arg.include.moderatorNotes).toBeUndefined();
    }
  });
});

describe('ReportsService: запрет сообщений', () => {
  it.each(['RESOLVED', 'REJECTED', 'CLOSED'])(
    'автор не может писать в обращение со статусом %s',
    async (status) => {
      const { prisma, service } = setup();
      prisma.report.findUnique.mockResolvedValue(reportRow({ status }));
      await expect(
        service.addMessage('R-1', 'author', { content: 'x' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.reportMessage.create).not.toHaveBeenCalled();
    },
  );

  it('автор не может писать при isLocked', async () => {
    const { prisma, service } = setup();
    prisma.report.findUnique.mockResolvedValue(reportRow({ isLocked: true }));
    await expect(
      service.addMessage('R-1', 'author', { content: 'x' }),
    ).rejects.toThrow('заблокировано');
  });

  it('автор не может писать в чужое обращение', async () => {
    const { prisma, service } = setup();
    prisma.report.findUnique.mockResolvedValue(reportRow());
    await expect(
      service.addMessage('R-1', 'stranger', { content: 'x' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('WAITING_RESPONSE и PENDING — писать можно', async () => {
    const { prisma, service } = setup();
    prisma.report.findUnique.mockResolvedValue(
      reportRow({ status: 'WAITING_RESPONSE' }),
    );
    await service.addMessage('R-1', 'author', { content: 'ответ' });
    expect((prisma.reportMessage.create as Mock).mock.calls).toHaveLength(1);
  });

  it('редактирование запрещено при isLocked', async () => {
    const { prisma, service } = setup();
    prisma.report.findUnique.mockResolvedValue(reportRow({ isLocked: true }));
    prisma.reportMessage.findUnique.mockResolvedValue({
      id: 'm1',
      reportId: 'r1',
      authorId: 'author',
      isDeleted: false,
      isStaff: false,
    });
    await expect(
      service.updateOwnMessage('R-1', 'author', 'm1', { content: 'x' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.reportMessage.update).not.toHaveBeenCalled();
  });

  it('редактирование запрещено в завершённом обращении', async () => {
    const { prisma, service } = setup();
    prisma.report.findUnique.mockResolvedValue(reportRow({ status: 'CLOSED' }));
    prisma.reportMessage.findUnique.mockResolvedValue({
      id: 'm1',
      reportId: 'r1',
      authorId: 'author',
      isDeleted: false,
      isStaff: false,
    });
    await expect(
      service.updateOwnMessage('R-1', 'author', 'm1', { content: 'x' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('чужое и удалённое сообщение править нельзя', async () => {
    const { prisma, service } = setup();
    prisma.report.findUnique.mockResolvedValue(reportRow());
    prisma.reportMessage.findUnique.mockResolvedValue({
      id: 'm1',
      reportId: 'r1',
      authorId: 'other',
      isDeleted: false,
      isStaff: false,
    });
    await expect(
      service.updateOwnMessage('R-1', 'author', 'm1', { content: 'x' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    prisma.reportMessage.findUnique.mockResolvedValue({
      id: 'm1',
      reportId: 'r1',
      authorId: 'author',
      isDeleted: true,
      isStaff: false,
    });
    await expect(
      service.updateOwnMessage('R-1', 'author', 'm1', { content: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ReportsService: лимиты по пользователю (SEC-01)', () => {
  const expect429 = async (promise: Promise<unknown>) => {
    const err = await promise.then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(
      HttpStatus.TOO_MANY_REQUESTS,
    );
  };
  const dto = { type: 'OTHER', description: 'Текст' } as CreateReportDto;

  it('обращение: N-е проходит (N-1 в окне), N+1-е даёт 429', async () => {
    const { prisma, service } = setup();
    prisma.report.count.mockResolvedValue(REPORT_CREATE_LIMIT - 1);
    await service.createReport('author', dto);
    expect(prisma.report.create).toHaveBeenCalledTimes(1);

    prisma.report.count.mockResolvedValue(REPORT_CREATE_LIMIT);
    await expect429(service.createReport('author', dto));
    expect(prisma.report.create).toHaveBeenCalledTimes(1);
  });

  it('обращение: учитываются автор и окно по createdAt', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T12:00:00Z'));
    try {
      const { prisma, service } = setup();
      await service.createReport('author', dto);
      const where = prisma.report.count.mock.calls[0][0].where;
      expect(where.authorId).toBe('author');
      expect(where.createdAt.gte).toEqual(
        new Date(Date.now() - REPORT_CREATE_WINDOW_MS),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('проблема с донатом входит в тот же лимит', async () => {
    const { prisma, service } = setup();
    prisma.report.count.mockResolvedValue(REPORT_CREATE_LIMIT);
    await expect429(
      service.createDonationProblem('author', { description: 'x' } as never),
    );
    expect(prisma.report.create).not.toHaveBeenCalled();
  });

  it('сообщение игрока: граница и окно, 429 сверх лимита', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T12:00:00Z'));
    try {
      const { prisma, service } = setup();
      prisma.report.findUnique.mockResolvedValue(reportRow());
      prisma.reportMessage.count.mockResolvedValue(REPORT_MESSAGE_LIMIT - 1);
      await service.addMessage('R-1', 'author', { content: 'x' });
      expect(prisma.reportMessage.create).toHaveBeenCalledTimes(1);
      const where = prisma.reportMessage.count.mock.calls[0][0].where;
      expect(where.authorId).toBe('author');
      expect(where.isStaff).toBe(false);
      expect(where.createdAt.gte).toEqual(
        new Date(Date.now() - REPORT_MESSAGE_WINDOW_MS),
      );

      prisma.reportMessage.count.mockResolvedValue(REPORT_MESSAGE_LIMIT);
      await expect429(service.addMessage('R-1', 'author', { content: 'x' }));
      expect(prisma.reportMessage.create).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('правка сообщения игрока: 429 сверх лимита; персонал не ограничен', async () => {
    const { prisma, service } = setup();
    prisma.report.findUnique.mockResolvedValue(reportRow());
    prisma.reportMessage.count.mockResolvedValue(REPORT_MESSAGE_LIMIT);

    prisma.reportMessage.findUnique.mockResolvedValue({
      id: 'm1',
      reportId: 'r1',
      authorId: 'author',
      isStaff: false,
      isDeleted: false,
    });
    await expect429(
      service.updateOwnMessage('R-1', 'author', 'm1', { content: 'x' }),
    );
    expect(prisma.reportMessage.update).not.toHaveBeenCalled();

    prisma.reportMessage.findUnique.mockResolvedValue({
      id: 'm2',
      reportId: 'r1',
      authorId: 'author',
      isStaff: true,
      isDeleted: false,
    });
    await service.updateOwnMessage('R-1', 'author', 'm2', { content: 'y' });
    expect(prisma.reportMessage.update).toHaveBeenCalledTimes(1);
    expect(prisma.reportMessage.count).toHaveBeenCalledTimes(1);
  });
});

describe('ReportsService: приватность сообщений персонала', () => {
  const messages = [
    { id: 'm1', authorId: 'author', isStaff: false, content: 'я' },
    { id: 'm2', authorId: 'staff-7', isStaff: true, content: 'ответ' },
  ];

  it('игрок: у сообщений персонала authorId = null, свои сохраняют', async () => {
    const { prisma, service } = setup();
    prisma.report.findUnique.mockResolvedValue(reportRow({ messages }));
    const res = await service.getByNumber('R-1', 'author', false);
    expect(
      (res.messages as Array<{ id: string; authorId: string | null }>).map(
        (m) => [m.id, m.authorId],
      ),
    ).toEqual([
      ['m1', 'author'],
      ['m2', null],
    ]);
  });

  it('персонал видит authorId сообщений', async () => {
    const { prisma, service } = setup();
    prisma.report.findUnique.mockResolvedValue(reportRow({ messages }));
    const res = await service.getByNumber('R-1', 'staff', true);
    expect(
      (res.messages as Array<{ authorId: string }>).map((m) => m.authorId),
    ).toEqual(['author', 'staff-7']);
  });

  it('addMessage и updateOwnMessage отдают тот же скрытый вид', async () => {
    const { prisma, service } = setup();
    prisma.report.findUnique.mockResolvedValue(reportRow({ messages }));
    const added = await service.addMessage('R-1', 'author', { content: 'x' });
    expect(added.messages[1].authorId).toBeNull();
    prisma.reportMessage.findUnique.mockResolvedValue({
      id: 'm1',
      reportId: 'r1',
      authorId: 'author',
      isStaff: false,
      isDeleted: false,
    });
    const edited = await service.updateOwnMessage('R-1', 'author', 'm1', {
      content: 'y',
    });
    expect(edited.messages[1].authorId).toBeNull();
  });
});

describe('ReportsService.historyForAuthor', () => {
  const created = new Date('2026-01-01T00:00:00Z');
  const audit = (extra: Record<string, unknown>) => ({
    id: 'a1',
    action: 'reports.status',
    changes: { status: 'RESOLVED', internalNote: 'секрет' },
    createdAt: new Date('2026-01-02T00:00:00Z'),
    actorId: 'staff-1',
    ipAddress: '1.2.3.4',
    ...extra,
  });

  it('чужой игрок — 403, без запроса в AuditLog', async () => {
    const { prisma, service } = setup();
    prisma.report.findUnique.mockResolvedValue(reportRow());
    await expect(
      service.historyForAuthor('R-1', 'stranger', {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
  });

  it('несуществующее обращение — 404', async () => {
    const { prisma, service } = setup();
    prisma.report.findUnique.mockResolvedValue(null);
    await expect(
      service.historyForAuthor('X', 'author', {}),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('белый список действий, поля только id/kind/status/createdAt, создание в конце', async () => {
    const { prisma, service } = setup();
    prisma.report.findUnique.mockResolvedValue(
      reportRow({ createdAt: created }),
    );
    prisma.auditLog.findMany.mockResolvedValue([
      audit({}),
      audit({ id: 'a2', action: 'reports.verdict', changes: { verdict: 'т' } }),
    ]);
    prisma.auditLog.count.mockResolvedValue(2);
    const res = await service.historyForAuthor('R-1', 'author', {});
    const arg = prisma.auditLog.findMany.mock.calls[0][0];
    expect([...arg.where.action.in].sort()).toEqual([
      'reports.status',
      'reports.verdict',
    ]);
    expect(Object.keys(arg.select).sort()).toEqual([
      'action',
      'changes',
      'createdAt',
      'id',
    ]);
    expect(res.total).toBe(3);
    expect(res.items.map((i) => i.kind)).toEqual([
      'STATUS_CHANGED',
      'VERDICT',
      'CREATED',
    ]);
    expect(res.items[0].status).toBe('RESOLVED');
    expect(res.items[1].status).toBeNull();
    for (const item of res.items) {
      expect(Object.keys(item).sort()).toEqual([
        'createdAt',
        'id',
        'kind',
        'status',
      ]);
    }
    expect(JSON.stringify(res)).not.toMatch(/staff-1|1\.2\.3\.4|секрет/);
  });

  it('невалидный status игнорируется; не последняя страница без CREATED', async () => {
    const { prisma, service } = setup();
    prisma.report.findUnique.mockResolvedValue(
      reportRow({ createdAt: created }),
    );
    prisma.auditLog.findMany.mockResolvedValue([
      audit({ changes: { status: 'HACKED' } }),
    ]);
    prisma.auditLog.count.mockResolvedValue(5);
    const res = await service.historyForAuthor('R-1', 'author', {
      page: 1,
      limit: 1,
    });
    expect(res.items).toHaveLength(1);
    expect(res.items[0].status).toBeNull();
    expect(res.total).toBe(6);
    expect(prisma.auditLog.findMany.mock.calls[0][0]).toMatchObject({
      skip: 0,
      take: 1,
    });
  });
});
