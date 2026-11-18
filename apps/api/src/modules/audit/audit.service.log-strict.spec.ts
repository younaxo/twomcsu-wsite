import { AuditService } from './audit.service';

function setup(create: jest.Mock) {
  const prisma = { auditLog: { create } };
  const config = { get: jest.fn().mockReturnValue(90) };
  return {
    service: new AuditService(prisma as never, config as never),
    create,
  };
}

describe('AuditService.log', () => {
  it('по умолчанию глотает сбой записи (info/warning)', async () => {
    const { service } = setup(jest.fn().mockRejectedValue(new Error('db')));
    await expect(
      service.log({ actorId: 'a', action: 'x', severity: 'warning' }),
    ).resolves.toBeUndefined();
  });

  it('critical и strict пробрасывают ошибку', async () => {
    const { service } = setup(jest.fn().mockRejectedValue(new Error('db')));
    await expect(
      service.log({ actorId: 'a', action: 'x', severity: 'critical' }),
    ).rejects.toThrow('db');
    await expect(
      service.log({
        actorId: 'a',
        action: 'x',
        severity: 'warning',
        strict: true,
      }),
    ).rejects.toThrow('db');
  });

  it('с tx пишет через транзакционный клиент, а не общий', async () => {
    const { service, create } = setup(jest.fn());
    const txCreate = jest.fn().mockResolvedValue({});
    await service.log({
      actorId: 'a',
      action: 'x',
      tx: { auditLog: { create: txCreate } } as never,
    });
    expect(txCreate).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
  });
});
