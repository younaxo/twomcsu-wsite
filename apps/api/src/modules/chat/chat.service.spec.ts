import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../roles/permission.service';
import { ChatService } from './chat.service';

function build(canDelete: boolean) {
  const update = jest.fn().mockResolvedValue({ id: 'm1', channelId: 'c1' });
  const prisma = {
    chatMessage: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'm1',
        authorId: 'author',
        isDeleted: false,
      }),
      update,
    },
  } as unknown as PrismaService;
  const permissions = {
    hasPermission: jest.fn().mockResolvedValue(canDelete),
  } as unknown as PermissionService;
  const service = new ChatService(
    prisma,
    {} as never,
    permissions,
    {} as never,
    {} as never,
  );
  return { service, update };
}

describe('ChatService.deleteMessage и beforeModerate (ADR-0156)', () => {
  it('автор удаляет своё сообщение — beforeModerate не вызывается', async () => {
    const { service, update } = build(false);
    const guard = jest.fn().mockResolvedValue(undefined);
    await service.deleteMessage('author', 'm1', undefined, guard);
    expect(guard).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalled();
  });

  it('модератор с правом — beforeModerate вызывается до удаления', async () => {
    const { service, update } = build(true);
    const guard = jest.fn().mockResolvedValue(undefined);
    await service.deleteMessage('mod', 'm1', 'spam', guard);
    expect(guard).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalled();
  });

  it('beforeModerate отклоняет — сообщение не удаляется', async () => {
    const { service, update } = build(true);
    const guard = jest.fn().mockRejectedValue(new Error('admin_2fa_required'));
    await expect(
      service.deleteMessage('mod', 'm1', undefined, guard),
    ).rejects.toThrow('admin_2fa_required');
    expect(update).not.toHaveBeenCalled();
  });

  it('без права — Forbidden, beforeModerate не вызывается', async () => {
    const { service, update } = build(false);
    const guard = jest.fn();
    await expect(
      service.deleteMessage('stranger', 'm1', undefined, guard),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(guard).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
