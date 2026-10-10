import type { MeResponse } from '@twomc/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFetchMock, jsonResponse, requestInfo, type FetchMock } from '@/test/http';
import { tokenStore } from '../api/token-store';
import { CaptchaRequiredError, resetAuthBootstrapForTests, useAuthStore } from './store';

const me: MeResponse = {
  id: 'u1',
  shortId: 7,
  tag: 'steve#1a2b',
  discriminator: '0042',
  email: 'steve@example.com',
  username: 'Steve_Mainer',
  accountType: 'DEFAULT',
  accessLevel: 0,
  mustChangePassword: false,
  avatar: null,
  banner: null,
  roles: [],
  permissions: { superuser: false, permissions: ['dashboard.view'], maxPriority: 10 },
};

const unauthorized = () =>
  jsonResponse({ statusCode: 401, message: 'Unauthorized' }, { status: 401 });

describe('auth store', () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = installFetchMock();
    tokenStore.clear();
    resetAuthBootstrapForTests();
    useAuthStore.setState({ status: 'idle', user: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('bootstrap: refresh по cookie → /auth/me → authenticated', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ user: { id: 'u1' }, accessToken: 'tok' }))
      .mockResolvedValueOnce(jsonResponse(me));

    await useAuthStore.getState().bootstrap();

    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(useAuthStore.getState().user?.username).toBe('Steve_Mainer');
    expect(requestInfo(fetchMock.mock.calls[0]).path).toBe('/auth/refresh');
    expect(requestInfo(fetchMock.mock.calls[1]).path).toBe('/auth/me');
    expect(requestInfo(fetchMock.mock.calls[1]).headers.get('authorization')).toBe('Bearer tok');
  });

  it('bootstrap: нет cookie (refresh 401) → anonymous без дополнительных запросов', async () => {
    fetchMock.mockResolvedValueOnce(unauthorized());

    await useAuthStore.getState().bootstrap();

    expect(useAuthStore.getState().status).toBe('anonymous');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('bootstrap: single-flight — повторный вызов (StrictMode) не делает второй refresh', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ user: { id: 'u1' }, accessToken: 'tok' }))
      .mockResolvedValueOnce(jsonResponse(me));

    const store = useAuthStore.getState();
    await Promise.all([store.bootstrap(), store.bootstrap()]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(useAuthStore.getState().status).toBe('authenticated');
  });

  it('login: сохраняет токен, грузит /auth/me, не подставляет Authorization в сам login', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ user: { id: 'u1' }, accessToken: 'login-tok' }))
      .mockResolvedValueOnce(jsonResponse(me));

    const user = await useAuthStore.getState().login({ emailOrUsername: 'steve', password: 'pw' });

    expect(user.id).toBe('u1');
    expect(tokenStore.get()).toBe('login-tok');
    expect(useAuthStore.getState().status).toBe('authenticated');
    const loginCall = requestInfo(fetchMock.mock.calls[0]);
    expect(loginCall.path).toBe('/auth/login');
    expect(loginCall.headers.has('authorization')).toBe(false);
  });

  it('login: ответ requiresCaptcha → CaptchaRequiredError, статус не меняется', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ requiresCaptcha: true }));

    await expect(
      useAuthStore.getState().login({ emailOrUsername: 'steve', password: 'pw' }),
    ).rejects.toBeInstanceOf(CaptchaRequiredError);
    expect(useAuthStore.getState().status).toBe('idle');
    expect(tokenStore.get()).toBeNull();
  });

  it('logout: вызывает /auth/logout и очищает сессию даже при ошибке сервера', async () => {
    tokenStore.set('tok');
    useAuthStore.setState({ status: 'authenticated', user: me });
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ statusCode: 500, message: 'boom' }, { status: 500 }),
    );

    await useAuthStore.getState().logout();

    expect(requestInfo(fetchMock.mock.calls[0]).path).toBe('/auth/logout');
    expect(useAuthStore.getState().status).toBe('anonymous');
    expect(useAuthStore.getState().user).toBeNull();
    expect(tokenStore.get()).toBeNull();
  });

  it('истёкшая сессия (401 + неудачный refresh в любом запросе) переводит store в anonymous', async () => {
    tokenStore.set('old');
    useAuthStore.setState({ status: 'authenticated', user: me });
    fetchMock.mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(unauthorized());

    const { api } = await import('../api/client');
    await expect(api.get('/admin/dashboard')).rejects.toMatchObject({ status: 401 });

    expect(useAuthStore.getState().status).toBe('anonymous');
    expect(tokenStore.get()).toBeNull();
  });
});
