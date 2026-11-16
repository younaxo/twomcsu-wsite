import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../roles/permission.service';
import { ModerationService } from './moderation.service';

const DENY = 'Недостаточно прав для действия над этим пользователем';

function build(canAct: (actor: string, target: string) => boolean) {
  const prisma = {
    chatMute: { create: jest.fn().mockResolvedValue({ id: 'm1' }) },
    chatBan: { create: jest.fn().mockResolvedValue({ id: 'b1' }) },
  };
  const permissions = {
    canActOn: jest.fn((a: string, t: string) => Promise.resolve(canAct(a, t))),
  };
  const service = new ModerationService(
    prisma as unknown as PrismaService,
    permissions as unknown as PermissionService,
  );
  return { service, prisma, permissions };
}

// Приоритеты: moderator=10, player=0, admin=100, owner=1000; SYSTEM — всегда false.
const priority: Record<string, number> = {
  mod: 10,
  player: 0,
  admin: 100,
  owner: 1000,
  peer: 10,
};
const rule = (a: string, t: string) =>
  t !== 'system' && (priority[a] ?? 0) > (priority[t] ?? 0);

describe('ModerationService: иерархия mute/ban', () => {
  const dtoMute = (userId: string) => ({ userId, reason: 'SPAM' }) as never;
  const dtoBan = (userId: string) => ({ userId, reason: 'x' }) as never;

  it.each(['admin', 'owner', 'system', 'mod', 'peer'])(
    'mute: модератор -> %s = отказ',
    async (target) => {
      const { service, prisma } = build(rule);
      await expect(service.muteUser('mod', dtoMute(target))).rejects.toThrow(
        new ForbiddenException(DENY),
      );
      expect(prisma.chatMute.create).not.toHaveBeenCalled();
    },
  );

  it.each(['admin', 'owner', 'system', 'mod', 'peer'])(
    'ban: модератор -> %s = отказ',
    async (target) => {
      const { service, prisma } = build(rule);
      await expect(service.banUser('mod', dtoBan(target))).rejects.toThrow(
        new ForbiddenException(DENY),
      );
      expect(prisma.chatBan.create).not.toHaveBeenCalled();
    },
  );

  it('самозащита не зависит от canActOn', async () => {
    const { service, prisma } = build(() => true);
    await expect(service.muteUser('mod', dtoMute('mod'))).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.banUser('mod', dtoBan('mod'))).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.chatMute.create).not.toHaveBeenCalled();
    expect(prisma.chatBan.create).not.toHaveBeenCalled();
  });

  it('mute: модератор -> обычный игрок = успех', async () => {
    const { service, prisma } = build(rule);
    await service.muteUser('mod', dtoMute('player'));
    expect(prisma.chatMute.create).toHaveBeenCalledTimes(1);
  });

  it('ban: модератор -> обычный игрок = успех', async () => {
    const { service, prisma } = build(rule);
    await service.banUser('mod', dtoBan('player'));
    expect(prisma.chatBan.create).toHaveBeenCalledTimes(1);
  });
});
