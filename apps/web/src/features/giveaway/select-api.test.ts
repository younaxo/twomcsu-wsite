import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockEnabled, selectApi } from './select-api';

describe('выбор API: моки только вне production', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('production игнорирует флаг моков', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_GIVEAWAY_MOCK', '1');
    expect(mockEnabled()).toBe(false);
    expect((await selectApi('?mock=before')).mock).toBeNull();
  });

  it('без флага моков нет даже в dev', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_GIVEAWAY_MOCK', '');
    expect(mockEnabled()).toBe(false);
  });

  it('dev с флагом берёт сценарий из ?mock=', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_GIVEAWAY_MOCK', '1');
    expect((await selectApi('?mock=before')).mock).toBe('before');
    expect((await selectApi('?mock=неизвестно')).mock).toBe('running');
  });
});
