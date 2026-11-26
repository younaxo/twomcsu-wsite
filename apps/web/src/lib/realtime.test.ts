import { describe, expect, it } from 'vitest';
import { realtimeTarget } from './realtime';

describe('realtimeTarget', () => {
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
});
