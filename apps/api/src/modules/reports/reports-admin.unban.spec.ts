import { ForbiddenException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../roles/permission.service';
import { ReportsAdminService } from './reports-admin.service';

type Ban = { id: string; userId: string; bannedBy: string };

function build(bans: Ban[], deniedIssuers: string[] = []) {
  const prisma = {
    reportBan: {
      findMany: jest.fn().mockResolvedValue(bans),
      updateMany: jest.fn().mockResolvedValue({ count: bans.length }),
    },
  };
  const permissions = {
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
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new ReportsAdminService(
    prisma as unknown as PrismaService,
    {} as never,
    permissions as unknown as PermissionService,
    audit as unknown as AuditService,
  );
  return { service, prisma, permissions, audit };
}

describe('ReportsAdminService.unbanUser (Q48, Q49)', () => {
  it('правило проверяется для каждого активного бана, аудит на каждый', async () => {
    const { service, prisma, permissions, audit } = build([
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
    expect(prisma.reportBan.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['b1', 'b2'] }, isActive: true },
      data: { isActive: false },
    });
    expect(audit.log).toHaveBeenCalledTimes(2);
    expect(audit.log).toHaveBeenCalledWith(
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
  });

  it('хоть один бан нельзя снять: 403, ничего не снимается, аудита нет', async () => {
    const { service, prisma, audit } = build(
      [
        { id: 'b1', userId: 'u', bannedBy: 'mod' },
        { id: 'b2', userId: 'u', bannedBy: 'admin' },
      ],
      ['admin'],
    );
    await expect(service.unbanUser('u', 'mod')).rejects.toMatchObject({
      response: { code: 'sanction_revoke_forbidden' },
    });
    expect(prisma.reportBan.updateMany).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('владелец снимает с себя чужой бан: self и ownerOverride в аудите', async () => {
    const { service, audit } = build([
      { id: 'b1', userId: 'owner', bannedBy: 'mod' },
    ]);
    await service.unbanUser('owner', 'owner');
    expect(audit.log).toHaveBeenCalledWith(
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

  it('нет активных банов: no-op без аудита', async () => {
    const { service, audit, permissions } = build([]);
    await expect(service.unbanUser('u', 'mod')).resolves.toBeUndefined();
    expect(permissions.assertCanRevokeSanction).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });
});
