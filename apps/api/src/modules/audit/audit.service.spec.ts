import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';

function build(createImpl?: () => Promise<unknown>) {
  const create = jest.fn((_args: { data: { severity: string } }) =>
    createImpl ? createImpl() : Promise.resolve({ id: 'a1' }),
  );
  const prisma = { auditLog: { create } };
  const config = { get: jest.fn().mockReturnValue(undefined) };
  const service = new AuditService(
    prisma as unknown as PrismaService,
    config as unknown as ConfigService,
  );
  const tx = { auditLog: { create } } as unknown as Prisma.TransactionClient;
  return { service, create, tx };
}

describe('AuditService.logInTx (Q48)', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('переносит все поля в tx.auditLog.create, severity по умолчанию info', async () => {
    const { service, create, tx } = build();
    await service.logInTx(tx, {
      actorId: 'actor',
      action: 'user.unban',
      targetType: 'User',
      targetId: 'target',
      changes: { issuerId: 'x', self: false },
      ipAddress: '1.2.3.4',
      userAgent: 'jest',
      duration: 12,
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      data: {
        actorId: 'actor',
        action: 'user.unban',
        targetType: 'User',
        targetId: 'target',
        changes: { issuerId: 'x', self: false },
        ipAddress: '1.2.3.4',
        userAgent: 'jest',
        severity: 'info',
        duration: 12,
      },
    });
  });

  it('явная severity сохраняется', async () => {
    const { service, create, tx } = build();
    await service.logInTx(tx, {
      actorId: 'actor',
      action: 'user.unban',
      severity: 'critical',
    });
    expect(create.mock.calls[0][0].data.severity).toBe('critical');
  });

  it('ошибка записи пробрасывается (транзакция откатится), не глотается и не логируется как warn', async () => {
    const boom = new Error('db down');
    const { service, tx } = build(() => Promise.reject(boom));
    await expect(
      service.logInTx(tx, { actorId: 'actor', action: 'user.unban' }),
    ).rejects.toBe(boom);
    expect(warn).not.toHaveBeenCalled();
  });

  it('для контраста: log() глотает ошибку не-critical и пишет warn', async () => {
    const { service } = build(() => Promise.reject(new Error('db down')));
    await expect(
      service.log({ actorId: 'actor', action: 'x' }),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
