import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  emptyResponse,
  installFetchMock,
  jsonResponse,
  requestInfo,
  type FetchMock,
} from '@/test/http';
import {
  api,
  apiFetchRaw,
  buildQueryString,
  refreshAccessToken,
  setSessionExpiredHandler,
} from './client';
import { ApiError, NetworkError } from './errors';
import { tokenStore } from './token-store';

describe('buildQueryString', () => {
  it('пропускает undefined/null/пустые значения и кодирует остальные', () => {
    expect(buildQueryString({ page: 2, q: 'ab c', empty: '', none: null, skip: undefined })).toBe(
      '?page=2&q=ab+c',
    );
    expect(buildQueryString(undefined)).toBe('');
    expect(buildQueryString({ flag: false })).toBe('?flag=false');
  });
});

describe('api client', () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = installFetchMock();
    tokenStore.clear();
    setSessionExpiredHandler(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('подставляет Bearer-токен, credentials: include и JSON-тело', async () => {
    tokenStore.set('access-1');
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));

    const result = await api.post<{ ok: boolean }>(
      '/admin/broadcast',
      { title: 'x' },
      { query: { a: 1 } },
    );

    expect(result).toEqual({ ok: true });
    const info = requestInfo(fetchMock.mock.calls[0]);
    expect(info.path).toBe('/admin/broadcast?a=1');
    expect(info.method).toBe('POST');
    expect(info.headers.get('authorization')).toBe('Bearer access-1');
    expect(info.headers.get('content-type')).toBe('application/json');
    expect(info.body).toBe(JSON.stringify({ title: 'x' }));
    expect(fetchMock.mock.calls[0][1]?.credentials).toBe('include');
  });

  it('преобразует ответ ≥ 400 в ApiError с сообщениями валидации', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { statusCode: 400, message: ['title must be a string', 'message too long'] },
        { status: 400 },
      ),
    );

    const error = await api.get('/admin/settings').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.status).toBe(400);
    expect(apiError.isValidation).toBe(true);
    expect(apiError.messages).toEqual(['title must be a string', 'message too long']);
    expect(apiError.message).toBe('title must be a string');
  });

  it('оборачивает сетевую ошибку в NetworkError', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(api.get('/health')).rejects.toBeInstanceOf(NetworkError);
  });

  it('на 401 один раз обновляет токен через refresh-cookie и повторяет запрос', async () => {
    tokenStore.set('expired');
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ statusCode: 401, message: 'Unauthorized' }, { status: 401 }),
      )
      .mockResolvedValueOnce(jsonResponse({ user: { id: 'u1' }, accessToken: 'fresh' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'u1' }));

    const me = await api.get<{ id: string }>('/auth/me');

    expect(me).toEqual({ id: 'u1' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(requestInfo(fetchMock.mock.calls[1]).path).toBe('/auth/refresh');
    expect(requestInfo(fetchMock.mock.calls[1]).method).toBe('POST');
    expect(requestInfo(fetchMock.mock.calls[2]).headers.get('authorization')).toBe('Bearer fresh');
    expect(tokenStore.get()).toBe('fresh');
  });

  it('если refresh не удался — очищает токен, вызывает обработчик истёкшей сессии и бросает 401', async () => {
    tokenStore.set('expired');
    const expired = vi.fn();
    setSessionExpiredHandler(expired);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ statusCode: 401, message: 'Unauthorized' }, { status: 401 }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ statusCode: 401, message: 'Unauthorized' }, { status: 401 }),
      );

    const error = await api.get('/auth/me').catch((e: unknown) => e);

    expect((error as ApiError).status).toBe(401);
    expect(expired).toHaveBeenCalledTimes(1);
    expect(tokenStore.get()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('без токена 401 не ведёт к повторному запросу refresh', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ statusCode: 401, message: 'Unauthorized' }, { status: 401 }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ statusCode: 401, message: 'Unauthorized' }, { status: 401 }),
      );
    const expired = vi.fn();
    setSessionExpiredHandler(expired);

    await expect(api.get('/auth/me')).rejects.toBeInstanceOf(ApiError);
    // refresh всё же пробуем (cookie может быть), но «сессия истекла» не
    // объявляем — пользователь и не был залогинен в этой вкладке.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(expired).not.toHaveBeenCalled();
  });

  it('retryOn401: false — запрос не повторяется (login/refresh)', async () => {
    tokenStore.set('t');
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ statusCode: 401, message: 'Неверный пароль' }, { status: 401 }),
    );
    await expect(
      api.post(
        '/auth/login',
        { emailOrUsername: 'a', password: 'b' },
        { auth: false, retryOn401: false },
      ),
    ).rejects.toMatchObject({ status: 401, message: 'Неверный пароль' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requestInfo(fetchMock.mock.calls[0]).headers.has('authorization')).toBe(false);
  });

  it('refreshAccessToken — single-flight: параллельные вызовы делят один запрос', async () => {
    let resolveRefresh: (value: Response) => void = () => undefined;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveRefresh = resolve;
        }),
    );

    const first = refreshAccessToken();
    const second = refreshAccessToken();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveRefresh(jsonResponse({ user: { id: 'u1' }, accessToken: 'shared' }));
    await expect(first).resolves.toBe('shared');
    await expect(second).resolves.toBe('shared');
    expect(tokenStore.get()).toBe('shared');
  });

  it('204 и parse: "none" возвращают undefined; apiFetchRaw отдаёт сырой Response', async () => {
    fetchMock.mockResolvedValueOnce(emptyResponse(204));
    await expect(api.delete('/admin/bookmarks/1')).resolves.toBeUndefined();

    fetchMock.mockResolvedValueOnce(
      new Response('id,name\n1,a', { status: 200, headers: { 'content-type': 'text/csv' } }),
    );
    const raw = await apiFetchRaw('/admin/users/export', { method: 'POST', body: {} });
    expect(raw.headers.get('content-type')).toBe('text/csv');
    await expect(raw.text()).resolves.toBe('id,name\n1,a');
  });
});
