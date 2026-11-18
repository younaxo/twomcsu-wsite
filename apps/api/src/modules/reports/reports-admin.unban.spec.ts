import { ConflictException, ForbiddenException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../roles/permission.service';
import { ReportsAdminService } from './reports-admin.service';

type Ban = { id: string; userId: string; bannedBy: string };

function build(
  bans: Ban[],
  opts: {
    deniedIssuers?: string[];
    canActOn?: boolean;
    updateCount?: number;
  } = {},
) {
  const deniedIssuers = opts.deniedIssuers ?? [];
  const tx = {
    reportBan: {
      updateMany: jest
        .fn()
        .mockResolvedValue({ count: opts.updateCount ?? bans.length }),
      create: jest.fn().mockResolvedValue({ id: 'new-ban' }),
    },
  };
  const prisma = {
    reportBan: {
      findMany: jest.fn().mockResolvedValue(bans),
    },
    $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const permissions = {
    canActOn: jest.fn().mockResolvedValue(opts.canActOn ?? true),
    assertCanRevokeSanction: jest.fn(
      (_actor: string, issuer: string, _target: string) =>
        deniedIssuers.includes(issuer)
          ? Promise.reject(
              new ForbiddenException({ code: 'sanction_revoke_forbidden' }),
            )
          : Promise.resolve({
              allowed: true,
              ownerOverride: _actor === 'owner' && issuer !== _actor,
              self: _target === _actor,
              issuerKnown: true,
            }),
    ),
  };
  const audit = {
    log: jest.fn().mockResolvedValue(undefined),
    logInTx: jest.fn().mockResolvedValue(undefined),
  };
  const service = new ReportsAdminService(
    prisma as unknown as PrismaService,
    {} as never,
    permissions as unknown as PermissionService,
    audit as unknown as AuditService,
  );
  return { service, prisma, tx, permissions, audit };
}

describe('ReportsAdminService.unbanUser (Q48, Q49)', () => {
  it('правило проверяется для каждого активного бана, аудит на каждый в транзакции', async () => {
    const { service, tx, permissions, audit } = build([
      { id: 'b1', userId: 'u', bannedBy: 'mod' },
      { id: 'b2', userId: 'u', bannedBy: 'admin' },
    ]);
    await service.unbanUser('u', 'admin');
    expect(permissions.assertCanRevokeSanction).toHaveBeenCalledTimes(2);
    expect(permissions.assertCanRevokeSanction).toHaveBeenCalledWith(
      'admin',
      'mod',
      'u',
    );
    expect(tx.reportBan.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['b1', 'b2'] }, isActive: true },
      data: { isActive: false },
    });
    expect(audit.logInTx).toHaveBeenCalledTimes(2);
    expect(audit.logInTx).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        actorId: 'admin',
        action: 'reports.ban.revoke',
        targetId: 'b1',
        changes: {
          userId: 'u',
          issuerId: 'mod',
          ownerOverride: false,
          self: false,
        },
      }),
    );
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('хоть один бан нельзя снять: 403, ничего не снимается, аудита нет', async () => {
    const { service, prisma, audit } = build(
      [
        { id: 'b1', userId: 'u', bannedBy: 'mod' },
        { id: 'b2', userId: 'u', bannedBy: 'admin' },
      ],
      { deniedIssuers: ['admin'] },
    );
    await expect(service.unbanUser('u', 'mod')).rejects.toMatchObject({
      response: { code: 'sanction_revoke_forbidden' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(audit.logInTx).not.toHaveBeenCalled();
  });

  it('гонка: число снятых != числу проверенных -> 409, аудит не пишется', async () => {
    const { service, audit } = build(
      [{ id: 'b1', userId: 'u', bannedBy: 'mod' }],
      { updateCount: 0 },
    );
    await expect(service.unbanUser('u', 'mod')).rejects.toThrow(
      ConflictException,
    );
    expect(audit.logInTx).not.toHaveBeenCalled();
  });

  it('ошибка аудита в транзакции пробрасывается (снятие откатывается)', async () => {
    const { service, audit } = build([
      { id: 'b1', userId: 'u', bannedBy: 'mod' },
    ]);
    audit.logInTx.mockRejectedValueOnce(new Error('db down'));
    await expect(service.unbanUser('u', 'mod')).rejects.toThrow('db down');
  });

  it('владелец снимает с себя чужой бан: self и ownerOverride в аудите', async () => {
    const { service, audit } = build([
      { id: 'b1', userId: 'owner', bannedBy: 'mod' },
    ]);
    await service.unbanUser('owner', 'owner');
    expect(audit.logInTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        changes: {
          userId: 'owner',
          issuerId: 'mod',
          ownerOverride: true,
          self: true,
        },
      }),
    );
  });

  it('нет активных банов: no-op без аудита и транзакции', async () => {
    const { service, prisma, audit, permissions } = build([]);
    await expect(service.unbanUser('u', 'mod')).resolves.toBeUndefined();
    expect(permissions.assertCanRevokeSanction).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(audit.logInTx).not.toHaveBeenCalled();
  });
});

describe('ReportsAdminService.banUser: замена бана = снятие (Q48, M-1)', () => {
  it('иерархия к цели: бан старшего/равного — 403, ничего не пишется', async () => {
    const { service, prisma } = build([], { canActOn: false });
    await expect(
      service.banUser('senior', 'junior', { reason: 'x' } as never),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.reportBan.findMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('младший не перебивает бан старшего: 403, бан старшего активен', async () => {
    const { service, prisma, tx } = build(
      [{ id: 'b1', userId: 'u', bannedBy: 'admin' }],
      { deniedIssuers: ['admin'] },
    );
    await expect(
      service.banUser('u', 'mod', { reason: 'x' } as never),
    ).rejects.toMatchObject({
      response: { code: 'sanction_revoke_forbidden' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.reportBan.updateMany).not.toHaveBeenCalled();
    expect(tx.reportBan.create).not.toHaveBeenCalled();
  });

  it('все или ни одного: один непроверяемый бан блокирует замену', async () => {
    const { service, tx } = build(
      [
        { id: 'b1', userId: 'u', bannedBy: 'mod' },
        { id: 'b2', userId: 'u', bannedBy: 'admin' },
      ],
      { deniedIssuers: ['admin'] },
    );
    await expect(
      service.banUser('u', 'mod', { reason: 'x' } as never),
    ).rejects.toThrow(ForbiddenException);
    expect(tx.reportBan.create).not.toHaveBeenCalled();
  });

  it('старший или равный перебивает: деактивация, аудит снятия и новый бан в одной транзакции', async () => {
    const { service, prisma, tx, audit } = build([
      { id: 'b1', userId: 'u', bannedBy: 'mod' },
    ]);
    await expect(
      service.banUser('u', 'admin', { reason: 'x' } as never),
    ).resolves.toEqual({ id: 'new-ban' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.reportBan.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['b1'] }, isActive: true },
      data: { isActive: false },
    });
    expect(audit.logInTx).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'reports.ban.revoke',
        targetId: 'b1',
      }),
    );
    expect(tx.reportBan.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'u', bannedBy: 'admin' }),
    });
  });

  it('нет активных банов: просто создаёт бан, без правила снятия', async () => {
    const { service, tx, permissions } = build([]);
    await service.banUser('u', 'mod', { reason: 'x' } as never);
    expect(permissions.assertCanRevokeSanction).not.toHaveBeenCalled();
    expect(tx.reportBan.updateMany).not.toHaveBeenCalled();
    expect(tx.reportBan.create).toHaveBeenCalledTimes(1);
  });

  it('гонка при замене: 409, новый бан не создаётся', async () => {
    const { service, tx } = build(
      [{ id: 'b1', userId: 'u', bannedBy: 'mod' }],
      { updateCount: 0 },
    );
    await expect(
      service.banUser('u', 'mod', { reason: 'x' } as never),
    ).rejects.toThrow(ConflictException);
    expect(tx.reportBan.create).not.toHaveBeenCalled();
  });
});
