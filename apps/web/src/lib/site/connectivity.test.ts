import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, NetworkError } from '../api/errors';
import {
  isConnectivityFailure,
  probeConnectivity,
  retryDelay,
  useConnectivity,
} from './connectivity';

const ok = (status = 200) => Promise.resolve(new Response(null, { status }));
const fail = () => Promise.reject(new TypeError('Failed to fetch'));

describe('connectivity (ADR-0086)', () => {
  it('паузы повторов растут и упираются в минуту', () => {
    expect([0, 1, 2, 3, 4, 9].map(retryDelay)).toEqual([
      5_000, 10_000, 20_000, 40_000, 60_000, 60_000,
    ]);
  });

  it('сбой связи — сеть и 502/503/504 без кода; техработы и 4xx — нет', () => {
    expect(isConnectivityFailure(new NetworkError())).toBe(true);
    expect(isConnectivityFailure(new ApiError(502, ['x']))).toBe(true);
    expect(isConnectivityFailure(new ApiError(503, ['x'], { code: 'MAINTENANCE' }))).toBe(false);
    expect(isConnectivityFailure(new ApiError(404, ['x']))).toBe(false);
  });

  it('проверка: API → online; только сайт → api-down; ничего → offline; 5xx API — не online', async () => {
    expect(await probeConnectivity(() => ok())).toBe('online');
    expect(await probeConnectivity((url) => (url.includes('/health') ? fail() : ok()))).toBe(
      'api-down',
    );
    expect(await probeConnectivity(() => fail())).toBe('offline');
    expect(await probeConnectivity((url) => (url.includes('/health') ? ok(503) : ok()))).toBe(
      'api-down',
    );
  });

  it('проверка сайта идёт мимо кэша Service Worker — уникальный URL', async () => {
    const urls: string[] = [];
    await probeConnectivity((url) => {
      urls.push(url);
      return fail();
    });
    expect(urls[1]).toMatch(/^\/icon\.png\?connectivity=\d+$/);
  });
});

describe('useConnectivity', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useConnectivity.setState({
      status: 'online',
      attempt: 0,
      checking: false,
      nextCheckAt: null,
      recoveries: 0,
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('сбой → api-down с повтором по расписанию → восстановление считается', async () => {
    let apiUp = false;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => (url.includes('/health') && !apiUp ? fail() : ok())),
    );
    useConnectivity.getState().reportFailure(new NetworkError());
    await vi.waitFor(() => expect(useConnectivity.getState().status).toBe('api-down'));
    expect(useConnectivity.getState().nextCheckAt).not.toBeNull();
    expect(useConnectivity.getState().attempt).toBe(1);

    apiUp = true;
    await vi.advanceTimersByTimeAsync(5_000);
    await vi.waitFor(() => expect(useConnectivity.getState().status).toBe('online'));
    expect(useConnectivity.getState()).toMatchObject({ attempt: 0, recoveries: 1 });
  });

  it('4xx не запускает проверку', () => {
    const check = vi.spyOn(useConnectivity.getState(), 'check');
    useConnectivity.getState().reportFailure(new ApiError(403, ['x']));
    expect(check).not.toHaveBeenCalled();
    expect(useConnectivity.getState().checking).toBe(false);
  });
});
