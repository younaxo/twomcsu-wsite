import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServiceWorkerRegistration, serviceWorkerUrl } from './service-worker';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

type Listener = (event: MessageEvent) => void;

function installServiceWorker(scriptURL = 'http://localhost/sw.js') {
  const unregister = vi.fn(async () => true);
  const register = vi.fn(async () => ({}));
  const listeners: Listener[] = [];
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      getRegistrations: async () => [{ unregister, active: { scriptURL } }],
      register,
      addEventListener: (_type: string, listener: Listener) => listeners.push(listener),
      removeEventListener: vi.fn(),
    },
  });
  return { unregister, register, listeners };
}

describe('ServiceWorkerRegistration вне production', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    push.mockReset();
  });

  it('снимает production-SW и только его кэши twomc-*, регистрирует push-режим без кэша', async () => {
    const { unregister, register } = installServiceWorker();
    const remove = vi.fn(async () => true);
    vi.stubGlobal('caches', {
      keys: async () => ['twomc-static-v1', 'other-app'],
      delete: remove,
    });
    render(<ServiceWorkerRegistration />);
    await waitFor(() => expect(register).toHaveBeenCalledWith('/sw.js?mode=push', { scope: '/' }));
    expect(unregister).toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith('twomc-static-v1');
    expect(remove).not.toHaveBeenCalledWith('other-app');
  });

  it('клик по системному уведомлению: SW → twomc:navigate → переход только по внутреннему пути', async () => {
    const { listeners } = installServiceWorker('http://localhost/sw.js?mode=push');
    vi.stubGlobal('caches', { keys: async () => [], delete: vi.fn() });
    render(<ServiceWorkerRegistration />);
    await waitFor(() => expect(listeners).toHaveLength(1));
    listeners[0]!({ data: { type: 'twomc:navigate', url: '/notifications' } } as MessageEvent);
    listeners[0]!({
      data: { type: 'twomc:navigate', url: 'https://evil.example' },
    } as MessageEvent);
    listeners[0]!({ data: { type: 'twomc:navigate', url: '//evil.example' } } as MessageEvent);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/notifications');
  });

  it('адрес SW: production — полный, иначе — только push', () => {
    expect(serviceWorkerUrl('production')).toBe('/sw.js');
    expect(serviceWorkerUrl('development')).toBe('/sw.js?mode=push');
  });
});
