import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreateReportDto } from './dto/create-report.dto';
import { toAppealedMirrorView } from './report-mirror-appeal';
import { DefaultReportPriorityProvider } from './report-priority.provider';
import { ReportsService } from './reports.service';

const ONLINE_UUID = '069a79f4-44e9-4726-a5be-fca90e38aaf5';
const OFFLINE_UUID = '069a79f4-44e9-3726-a5be-fca90e38aaf5';

function mirrorRow(extra: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    kind: 'BAN',
    sourceId: 123n,
    status: 'ACTIVE',
    startedAt: new Date('2026-11-01T00:00:00Z'),
    until: null as Date | null,
    removedAt: null,
    subjectName: 'Steve',
    subjectUuid: ONLINE_UUID as string | null,
    ...extra,
  };
}

function setup(
  opts: {
    account?: { uuid: string } | null;
    row?: ReturnType<typeof mirrorRow> | null;
    open?: unknown;
    recent?: unknown;
  } = {},
) {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'm1' }]),
    minecraftAccount: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          opts.account === undefined ? { uuid: ONLINE_UUID } : opts.account,
        ),
    },
    minecraftPunishment: {
      findUnique: jest
        .fn()
        .mockResolvedValue(opts.row === undefined ? mirrorRow() : opts.row),
    },
    report: {
      findFirst: jest
        .fn()
        .mockResolvedValueOnce(opts.open ?? null)
        .mockResolvedValueOnce(opts.recent ?? null),
      create: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ id: 'r1', ...data }),
        ),
    },
  };
  const prisma = {
    reportBan: { findFirst: jest.fn().mockResolvedValue(null) },
    user: { findMany: jest.fn().mockResolvedValue([]) },
    report: {
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)),
  };
  const audit = { logInTx: jest.fn().mockResolvedValue(undefined) };
  const service = new ReportsService(
    prisma as never,
    new DefaultReportPriorityProvider(),
    audit as never,
  );
  return { service, tx, prisma, audit };
}

const dto = (extra: Partial<CreateReportDto> = {}): CreateReportDto =>
  ({
    type: 'PUNISHMENT_APPEAL',
    description: 'Прошу пересмотреть',
    appealedPunishmentRef: 'ban-123',
    ...extra,
  }) as CreateReportDto;

describe('ReportsService.createReport: обжалование наказания зеркала', () => {
  it('успех: связь с зеркалом, аудит в транзакции, без BigInt в ответе', async () => {
    const { service, tx, audit } = setup();
    tx.report.create.mockImplementation(({ data }) =>
      Promise.resolve({
        id: 'r1',
        ...data,
        appealedMinecraftPunishment: mirrorRow(),
      }),
    );
    const result = await service.createReport('author', dto());
    const data = tx.report.create.mock.calls[0][0].data;
    expect(data.appealedMinecraftPunishmentId).toBe('m1');
    expect(data.appealedPunishmentId).toBeUndefined();
    expect(audit.logInTx).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        actorId: 'author',
        action: 'reports.appeal.create',
        targetId: 'r1',
      }),
    );
    expect(result.appealedMinecraftPunishment).toEqual({
      ref: 'ban-123',
      kind: 'BAN',
      status: 'ACTIVE',
      startedAt: '2026-11-01T00:00:00.000Z',
      until: null,
      removedAt: null,
    });
    // Игроку не отдаются ни subjectName, ни BigInt: JSON сериализуется.
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it('нет привязки Minecraft - 403 minecraft_not_linked', async () => {
    const { service } = setup({ account: null });
    const error = await service
      .createReport('author', dto())
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toMatchObject({
      code: 'minecraft_not_linked',
    });
  });

  it('офлайн-uuid (версия 3) считается отсутствием привязки', async () => {
    const { service } = setup({ account: { uuid: OFFLINE_UUID } });
    await expect(service.createReport('author', dto())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('чужое наказание (другой uuid) - 404, как несуществующее', async () => {
    const other = setup({
      row: mirrorRow({ subjectUuid: '11111111-2222-4333-8444-555555555555' }),
    });
    await expect(
      other.service.createReport('author', dto()),
    ).rejects.toBeInstanceOf(NotFoundException);
    const missing = setup({ row: null });
    await expect(
      missing.service.createReport('author', dto()),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(other.tx.report.create).not.toHaveBeenCalled();
  });

  it('наказание без uuid субъекта - 404', async () => {
    const { service } = setup({ row: mirrorRow({ subjectUuid: null }) });
    await expect(service.createReport('author', dto())).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('удалённое в источнике - 404', async () => {
    const { service } = setup({
      row: mirrorRow({ status: 'DELETED_AT_SOURCE' }),
    });
    await expect(service.createReport('author', dto())).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('не действующее (снято или истекло) - 400 punishment_not_appealable', async () => {
    for (const row of [
      mirrorRow({ status: 'REMOVED' }),
      mirrorRow({ status: 'EXPIRED' }),
      mirrorRow({ until: new Date('2020-01-01T00:00:00Z') }),
    ]) {
      const { service } = setup({ row });
      const error = await service
        .createReport('author', dto())
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'punishment_not_appealable',
      });
    }
  });

  it('уже есть открытое обращение - 409 appeal_already_open', async () => {
    const { service, tx } = setup({ open: { id: 'x' } });
    await expect(service.createReport('author', dto())).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.report.create).not.toHaveBeenCalled();
  });

  it('повтор в течение суток после закрытого - 429 appeal_cooldown', async () => {
    const { service } = setup({ recent: { id: 'old' } });
    const error = await service
      .createReport('author', dto())
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
    expect((error as HttpException).getResponse()).toMatchObject({
      code: 'appeal_cooldown',
    });
  });

  it('гонка: P2002 частичного индекса даёт 409', async () => {
    const { service, tx } = setup();
    tx.report.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(service.createReport('author', dto())).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('блокирует строку зеркала один раз до проверок', async () => {
    const { service, tx } = setup();
    await service.createReport('author', dto());
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('оба поля наказания сразу - 400', async () => {
    const { service } = setup();
    await expect(
      service.createReport('author', dto({ appealedPunishmentId: 'p1' })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ref для другого типа обращения - 400', async () => {
    const { service } = setup();
    await expect(
      service.createReport(
        'author',
        dto({ type: 'TECHNICAL_ISSUE', targets: [] }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ref вида warn-1 парсер не принимает - 404', async () => {
    const { service } = setup();
    await expect(
      service.createReport('author', dto({ appealedPunishmentRef: 'warn-1' })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('toAppealedMirrorView', () => {
  const now = Date.parse('2026-11-10T00:00:00Z');
  it('персоналу добавляет subjectName, игроку нет', () => {
    expect(
      toAppealedMirrorView(mirrorRow() as never, now, true).subjectName,
    ).toBe('Steve');
    expect(
      'subjectName' in toAppealedMirrorView(mirrorRow() as never, now, false),
    ).toBe(false);
  });
  it('истёкший срок отдаётся как EXPIRED, удалённое в источнике как REMOVED', () => {
    expect(
      toAppealedMirrorView(
        mirrorRow({ until: new Date('2026-11-02T00:00:00Z') }) as never,
        now,
        false,
      ).status,
    ).toBe('EXPIRED');
    expect(
      toAppealedMirrorView(
        mirrorRow({ status: 'DELETED_AT_SOURCE' }) as never,
        now,
        false,
      ).status,
    ).toBe('REMOVED');
  });
});
