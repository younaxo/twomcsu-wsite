import { PunishmentsScheduler } from './punishments.scheduler';
import {
  DEFAULT_BATCH_SIZE,
  DEFAULT_POLL_INTERVAL_MS,
  readPunishmentsConfig,
} from './punishments.config';

const reader = (values: Record<string, unknown>) => ({
  get: <T = string>(key: string) => values[key] as T | undefined,
});

describe('readPunishmentsConfig', () => {
  it('по умолчанию выключено, числа — значения по умолчанию', () => {
    const c = readPunishmentsConfig(reader({}));
    expect(c.enabled).toBe(false);
    expect(c.pollIntervalMs).toBe(DEFAULT_POLL_INTERVAL_MS);
    expect(c.batchSize).toBe(DEFAULT_BATCH_SIZE);
    expect(c.activeCheckIntervalMs).toBe(15_000);
    expect(c.reconcileIntervalMs).toBe(3_600_000);
  });

  it('включается только значением true; мусор в числах заменяется умолчанием', () => {
    expect(
      readPunishmentsConfig(reader({ LITEBANS_ENABLED: 'true' })).enabled,
    ).toBe(true);
    expect(
      readPunishmentsConfig(reader({ LITEBANS_ENABLED: 'yes' })).enabled,
    ).toBe(false);
    expect(
      readPunishmentsConfig(reader({ LITEBANS_BATCH_SIZE: 'abc' })).batchSize,
    ).toBe(DEFAULT_BATCH_SIZE);
    expect(
      readPunishmentsConfig(reader({ LITEBANS_BATCH_SIZE: '100' })).batchSize,
    ).toBe(100);
  });
});

describe('PunishmentsScheduler без источника', () => {
  it('не запускает таймеры и не трогает Redis', async () => {
    const spy = jest.spyOn(global, 'setTimeout');
    const redis = {
      get client(): never {
        throw new Error('Redis не должен использоваться');
      },
    };
    const scheduler = new PunishmentsScheduler(
      { isConfigured: false } as never,
      redis as never,
      readPunishmentsConfig(reader({})),
    );
    scheduler.onModuleInit();
    await scheduler.onModuleDestroy();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
