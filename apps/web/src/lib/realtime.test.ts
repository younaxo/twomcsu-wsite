import { afterEach, describe, expect, it, vi } from 'vitest';
import { isOfflineReason, realtimeTarget } from './realtime';

describe('realtimeTarget', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('отдельный хост API: путь по умолчанию', () => {
    expect(realtimeTarget('/chat', 'https://api.twomc.su')).toEqual({
      url: 'https://api.twomc.su/chat',
      path: '/socket.io',
    });
  });
  it('API под префиксом /api: префикс уходит в path, а не в namespace', () => {
    expect(realtimeTarget('/messages', 'https://stand.example/api')).toEqual({
      url: 'https://stand.example/messages',
      path: '/api/socket.io',
    });
  });
  it('локальный API с портом и хвостовым слэшем', () => {
    expect(realtimeTarget('/notifications', 'http://localhost:4000/')).toEqual({
      url: 'http://localhost:4000/notifications',
      path: '/socket.io',
    });
  });
  it('относительный /api: origin из window.location, path /api/socket.io', () => {
    vi.stubGlobal('window', { location: { origin: 'https://stand.example' } });
    expect(realtimeTarget('/chat', '/api')).toEqual({
      url: 'https://stand.example/chat',
      path: '/api/socket.io',
    });
    expect(realtimeTarget('/chat', '/api/')).toEqual({
      url: 'https://stand.example/chat',
      path: '/api/socket.io',
    });
  });
  it('SSR без window: относительный адрес без падения', () => {
    vi.stubGlobal('window', undefined);
    expect(realtimeTarget('/chat', '/api')).toEqual({ url: '/chat', path: '/api/socket.io' });
  });
});

describe('isOfflineReason', () => {
  it('io server disconnect и io client disconnect не считаются потерей связи', () => {
    expect(isOfflineReason('io server disconnect')).toBe(false);
    expect(isOfflineReason('io client disconnect')).toBe(false);
  });
  it('обрыв транспорта — потеря связи', () => {
    expect(isOfflineReason('transport close')).toBe(true);
    expect(isOfflineReason('ping timeout')).toBe(true);
  });
});
