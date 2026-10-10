import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServiceWorkerRegistration } from './service-worker';

describe('ServiceWorkerRegistration вне production', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('снимает оставшийся SW и удаляет только его кэши twomc-* (dev-чанки не хешированы)', async () => {
    const unregister = vi.fn(async () => true);
    const register = vi.fn();
    const remove = vi.fn(async () => true);
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistrations: async () => [{ unregister }], register },
    });
    vi.stubGlobal('caches', {
      keys: async () => ['twomc-static-v1', 'other-app'],
      delete: remove,
    });
    render(<ServiceWorkerRegistration />);
    await waitFor(() => expect(remove).toHaveBeenCalledWith('twomc-static-v1'));
    expect(unregister).toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalledWith('other-app');
    expect(register).not.toHaveBeenCalled();
  });
});
