import { BadRequestException } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

function setup() {
  const upsert = jest.fn().mockResolvedValue({});
  const prisma = {
    siteSetting: { findMany: jest.fn().mockResolvedValue([]), upsert },
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new DashboardService(
    prisma as never,
    {} as never,
    audit as never,
  );
  return { service, upsert };
}

describe('DashboardService.upsertSettings: store.offerVersion', () => {
  it.each(['', '   ', 'x'.repeat(33)])(
    'значение длиной %p отклоняется, запись не выполняется',
    async (value) => {
      const { service, upsert } = setup();
      await expect(
        service.upsertSettings(
          { settings: { 'store.offerVersion': value } },
          'admin',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(upsert).not.toHaveBeenCalled();
    },
  );

  it.each(['1', 'v-2026-11', 'x'.repeat(32)])(
    'значение %p принимается',
    async (value) => {
      const { service, upsert } = setup();
      await service.upsertSettings(
        { settings: { 'store.offerVersion': value } },
        'admin',
      );
      expect(upsert).toHaveBeenCalledTimes(1);
    },
  );

  it('другие ключи не затрагиваются проверкой', async () => {
    const { service, upsert } = setup();
    await service.upsertSettings({ settings: { other: '' } }, 'admin');
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});
