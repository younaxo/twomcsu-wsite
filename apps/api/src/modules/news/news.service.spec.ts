import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { NewsStatus } from '@prisma/client';
import { NewsService } from './news.service';

type Mock = jest.Mock;

function build(overrides: {
  news?: Record<string, unknown> | null;
  comment?: Record<string, unknown> | null;
  user?: Record<string, unknown> | null;
}) {
  const news =
    overrides.news === undefined
      ? {
          id: 'n1',
          slug: 'patch',
          status: NewsStatus.PUBLISHED,
          allowComments: true,
        }
      : overrides.news;
  const comment =
    overrides.comment === undefined
      ? { id: 'c1', newsId: 'n1', authorId: 'u1', isDeleted: false }
      : overrides.comment;
  const user =
    overrides.user === undefined ? { isBanned: false } : overrides.user;
  const prisma = {
    news: { findUnique: jest.fn().mockResolvedValue(news) },
    newsComment: {
      findUnique: jest.fn().mockResolvedValue(comment),
      update: jest.fn().mockResolvedValue({ id: 'c1', isEdited: true }),
    },
    user: { findUnique: jest.fn().mockResolvedValue(user) },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  (prisma.news as Record<string, unknown>).update = jest.fn();
  const service = new NewsService(prisma as never, {} as never);
  return { service, prisma };
}

const dto = { content: 'новый текст' };

describe('NewsService.updateComment', () => {
  it('правит свой комментарий этой новости', async () => {
    const { service, prisma } = build({});
    await expect(
      service.updateComment('u1', 'patch', 'c1', dto),
    ).resolves.toEqual({
      id: 'c1',
      isEdited: true,
    });
    expect(prisma.newsComment.update as Mock).toHaveBeenCalledTimes(1);
  });

  it('комментарий другой новости: 404, обновления нет', async () => {
    const { service, prisma } = build({
      comment: { id: 'c1', newsId: 'other', authorId: 'u1', isDeleted: false },
    });
    await expect(
      service.updateComment('u1', 'patch', 'c1', dto),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.newsComment.update as Mock).not.toHaveBeenCalled();
  });

  it('неизвестный slug или неопубликованная новость: 404', async () => {
    for (const news of [null, { id: 'n1', status: NewsStatus.DRAFT }]) {
      const { service, prisma } = build({ news });
      await expect(
        service.updateComment('u1', 'patch', 'c1', dto),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.newsComment.update as Mock).not.toHaveBeenCalled();
    }
  });

  it('забаненный автор: 403', async () => {
    const { service, prisma } = build({ user: { isBanned: true } });
    await expect(
      service.updateComment('u1', 'patch', 'c1', dto),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.newsComment.update as Mock).not.toHaveBeenCalled();
  });

  it('комментарии отключены (allowComments=false): 403', async () => {
    const { service, prisma } = build({
      news: {
        id: 'n1',
        slug: 'patch',
        status: NewsStatus.PUBLISHED,
        allowComments: false,
      },
    });
    await expect(
      service.updateComment('u1', 'patch', 'c1', dto),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.newsComment.update as Mock).not.toHaveBeenCalled();
  });

  it('чужой комментарий: 403; удалённый: 404', async () => {
    const other = build({});
    await expect(
      other.service.updateComment('u2', 'patch', 'c1', dto),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const deleted = build({
      comment: { id: 'c1', newsId: 'n1', authorId: 'u1', isDeleted: true },
    });
    await expect(
      deleted.service.updateComment('u1', 'patch', 'c1', dto),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('NewsService.removeComment', () => {
  it('удаляет свой комментарий этой новости', async () => {
    const { service, prisma } = build({});
    await expect(
      service.removeComment('u1', 'patch', 'c1'),
    ).resolves.toBeUndefined();
    expect(prisma.$transaction as Mock).toHaveBeenCalledTimes(1);
  });

  it('комментарий другой новости: 404, удаления нет', async () => {
    const { service, prisma } = build({
      comment: { id: 'c1', newsId: 'other', authorId: 'u1', isDeleted: false },
    });
    await expect(
      service.removeComment('u1', 'patch', 'c1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction as Mock).not.toHaveBeenCalled();
  });

  it('неизвестный slug: 404', async () => {
    const { service, prisma } = build({ news: null });
    await expect(
      service.removeComment('u1', 'patch', 'c1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction as Mock).not.toHaveBeenCalled();
  });

  it('чужой комментарий: 403; удалённый: 404', async () => {
    const other = build({});
    await expect(
      other.service.removeComment('u2', 'patch', 'c1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const deleted = build({
      comment: { id: 'c1', newsId: 'n1', authorId: 'u1', isDeleted: true },
    });
    await expect(
      deleted.service.removeComment('u1', 'patch', 'c1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
