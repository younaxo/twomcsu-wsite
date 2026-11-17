import { ForbiddenException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { QuickModerationService } from '../moderation/quick-moderation.service';
import { PermissionService } from '../roles/permission.service';
import { AdminUsersBulkService } from './admin-users-bulk.service';
import { BulkUserAction } from './dto/bulk-users.dto';

function build(opts: {
  canActOn: (actor: string, target: string) => boolean;
  superusers?: string[];
  unban?: (target: string, actor: string) => Promise<unknown>;
}) {
  const moderation = {
    ban: jest.fn().mockResolvedValue({}),
    unban: jest.fn(
      opts.unban ?? (() => Promise.resolve({ success: true as const })),
    ),
  };
  const permissions = {
    canActOn: jest.fn((a: string, t: string) =>
      Promise.resolve(opts.canActOn(a, t)),
    ),
    isSuperuser: jest.fn((id: string) =>
      Promise.resolve((opts.superusers ?? []).includes(id)),
    ),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new AdminUsersBulkService(
    moderation as unknown as QuickModerationService,
    permissions as unknown as PermissionService,
    audit as unknown as AuditService,
  );
  return { service, moderation, permissions, audit };
}

const unbanDto = (userIds: string[]) =>
  ({ userIds, action: BulkUserAction.UNBAN }) as never;

describe('AdminUsersBulkService: массовое снятие бана (Q48, Q49)', () => {
  it('передаёт действующего в unban и не дублирует аудит снятия', async () => {
    const { service, moderation, audit } = build({ canActOn: () => true });
    const res = await service.bulkUpdate(unbanDto(['a', 'b']), 'mod');
    expect(res).toEqual({ succeeded: ['a', 'b'], failed: [] });
    expect(moderation.unban).toHaveBeenCalledWith('a', 'mod');
    expect(moderation.unban).toHaveBeenCalledWith('b', 'mod');
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('правило отказало по одному пользователю: он в failed с кодом, остальные снимаются', async () => {
    const { service } = build({
      canActOn: () => true,
      unban: (target) =>
        target === 'old'
          ? Promise.reject(
              new ForbiddenException({
                code: 'sanction_revoke_forbidden',
                message: 'Недостаточно прав для снятия этого ограничения',
              }),
            )
          : Promise.resolve({ success: true }),
    });
    const res = await service.bulkUpdate(unbanDto(['old', 'ok']), 'mod');
    expect(res.succeeded).toEqual(['ok']);
    expect(res.failed).toEqual([
      {
        userId: 'old',
        reason: 'Недостаточно прав для снятия этого ограничения',
        code: 'sanction_revoke_forbidden',
      },
    ]);
  });

  it('иерархия к цели сохраняется: canActOn=false -> failed, unban не вызван', async () => {
    const { service, moderation } = build({ canActOn: () => false });
    const res = await service.bulkUpdate(unbanDto(['boss']), 'mod');
    expect(res.failed).toHaveLength(1);
    expect(moderation.unban).not.toHaveBeenCalled();
  });

  it('не-владелец с себя: canActOn=false (равный приоритет) -> отказ', async () => {
    const { service, moderation } = build({
      canActOn: (a, t) => a !== t,
    });
    const res = await service.bulkUpdate(unbanDto(['mod']), 'mod');
    expect(res.succeeded).toEqual([]);
    expect(moderation.unban).not.toHaveBeenCalled();
  });

  it('владелец снимает бан с себя несмотря на canActOn(self)=false', async () => {
    const { service, moderation } = build({
      canActOn: (a, t) => a !== t,
      superusers: ['owner'],
    });
    const res = await service.bulkUpdate(unbanDto(['owner']), 'owner');
    expect(res.succeeded).toEqual(['owner']);
    expect(moderation.unban).toHaveBeenCalledWith('owner', 'owner');
  });

  it('BAN владельцем на себя по-прежнему блокируется иерархией', async () => {
    const { service, moderation } = build({
      canActOn: (a, t) => a !== t,
      superusers: ['owner'],
    });
    const res = await service.bulkUpdate(
      { userIds: ['owner'], action: BulkUserAction.BAN } as never,
      'owner',
    );
    expect(res.succeeded).toEqual([]);
    expect(moderation.ban).not.toHaveBeenCalled();
  });
});
