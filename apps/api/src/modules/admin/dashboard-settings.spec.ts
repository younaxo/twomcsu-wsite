import { BadRequestException, HttpException } from '@nestjs/common';
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

describe('DashboardService.upsertSettings: защищённые ключи', () => {
  it.each(['store.delivery.extra_command_roots', 'store.text.x'])(
    'ключ %p отклоняется кодом settings_key_protected, запись не выполняется',
    async (key) => {
      const { service, upsert } = setup();
      const err = await service
        .upsertSettings({ settings: { ok: '1', [key]: 'x' } }, 'admin')
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      const http = err as HttpException;
      expect(http.getStatus()).toBe(403);
      expect(http.getResponse()).toMatchObject({
        code: 'settings_key_protected',
      });
      expect(upsert).not.toHaveBeenCalled();
    },
  );

  it('store.delivery.enabled проходит как до 0.11', async () => {
    const { service, upsert } = setup();
    await service.upsertSettings(
      { settings: { 'store.delivery.enabled': 'true' } },
      'admin',
    );
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('обычный ключ проходит как прежде', async () => {
    const { service, upsert } = setup();
    await service.upsertSettings({ settings: { 'site.title': 'x' } }, 'admin');
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});

describe('DashboardService.upsertSettings: executor.command (R143)', () => {
  const KEY = 'store.delivery.executor.command.enabled';

  function withExecutor(operational: boolean | null) {
    const base = setup();
    const service =
      operational === null
        ? base.service
        : new DashboardService(
            {
              siteSetting: {
                findMany: jest.fn().mockResolvedValue([]),
                upsert: base.upsert,
              },
            } as never,
            {} as never,
            { log: jest.fn().mockResolvedValue(undefined) } as never,
            { operational: () => operational } as never,
          );
    return { service, upsert: base.upsert };
  }

  it.each([null, false])(
    'true без транспорта с дедупликацией (%p): 409, запись не выполняется',
    async (operational) => {
      const { service, upsert } = withExecutor(operational);
      const err = await service
        .upsertSettings({ settings: { [KEY]: 'true' } }, 'admin')
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(409);
      expect((err as HttpException).getResponse()).toMatchObject({
        code: 'delivery_command_transport_unavailable',
      });
      expect(upsert).not.toHaveBeenCalled();
    },
  );

  it('false всегда можно записать (выключение)', async () => {
    const { service, upsert } = withExecutor(false);
    await service.upsertSettings({ settings: { [KEY]: 'false' } }, 'admin');
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('true с транспортом с дедупликацией проходит', async () => {
    const { service, upsert } = withExecutor(true);
    await service.upsertSettings({ settings: { [KEY]: 'true' } }, 'admin');
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});
