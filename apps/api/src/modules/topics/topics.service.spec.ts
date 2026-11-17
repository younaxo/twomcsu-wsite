import { TopicVisibility } from '@prisma/client';
import { TopicsService } from './topics.service';

const KEY = 'k'.repeat(32);

function setup(env: { key?: string; nodeEnv?: string }) {
  const hasPermission = jest.fn().mockResolvedValue(true);
  const config = {
    get: (name: string, def?: string) =>
      name === 'TWO_FACTOR_ENCRYPTION_KEY'
        ? (env.key ?? def)
        : name === 'NODE_ENV'
          ? env.nodeEnv
          : def,
  };
  const topics = [
    { id: 't1', visibility: TopicVisibility.PUBLIC },
    { id: 't2', visibility: TopicVisibility.ADMIN_ONLY },
  ];
  const prisma = { topic: { findMany: jest.fn().mockResolvedValue(topics) } };
  const service = new TopicsService(
    prisma as never,
    { hasPermission } as never,
    config as never,
  );
  return { service, hasPermission };
}

describe('TopicsService и 2FA персонала (Q22, ADR-0169)', () => {
  it('ключ задан, персонал без 2FA: видит только публичные темы', async () => {
    const { service, hasPermission } = setup({ key: KEY });
    const res = await service.listPublic({} as never, {
      id: 'u1',
      twoFactorEnabled: false,
    });
    expect(res.map((t) => t.id)).toEqual(['t1']);
    expect(hasPermission).not.toHaveBeenCalled();
  });

  it('ключ задан, персонал с 2FA: видит и ограниченные темы', async () => {
    const { service, hasPermission } = setup({ key: KEY });
    const res = await service.listPublic({} as never, {
      id: 'u1',
      twoFactorEnabled: true,
    });
    expect(res.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(hasPermission).toHaveBeenCalledWith('u1', 'topics.view.admin');
  });

  it('без ключа в явном test: как раньше', async () => {
    const { service } = setup({ nodeEnv: 'test' });
    const res = await service.listPublic({} as never, { id: 'u1' });
    expect(res.map((t) => t.id)).toEqual(['t1', 't2']);
  });

  it('аноним видит только публичные', async () => {
    const { service } = setup({ key: KEY });
    const res = await service.listPublic({} as never, null);
    expect(res.map((t) => t.id)).toEqual(['t1']);
  });
});
