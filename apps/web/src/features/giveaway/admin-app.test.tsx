import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AdminApp, AdminPanel, loginErrorText } from './admin-app';
import { CSRF_HEADER, createHttpAdminApi } from './admin-api';
import { DrawSection } from './admin-draw';
import { createMockAdminApi } from './admin-mock';
import {
  AdminApiError,
  CALCULATE_PHRASE,
  type AdminApi,
  type AdminDraw,
  type AdminSession,
} from './admin-types';

vi.mock('@/components/shell/site-header', () => ({ SiteHeader: () => null }));
vi.mock('@/components/shell/site-footer', () => ({ SiteFooter: () => null }));

const HASH = 'a'.repeat(64);
const session: AdminSession = {
  discordId: '1',
  discordName: 'Admin',
  csrfToken: 'csrf-token-1',
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  idleTimeoutS: 1800,
  testModeEnabled: true,
};

function draw(over: Partial<AdminDraw> = {}): AdminDraw {
  return {
    mode: 'live',
    test: false,
    status: 'frozen',
    canFreeze: false,
    snapshotHash: HASH,
    ticketCount: 20,
    frozenAt: null,
    algorithm: 'twomc-giveaway-draw-v1',
    seed: null,
    calculatedAt: null,
    broadcastAt: null,
    revision: 1,
    ...over,
  };
}

function fakeApi(over: Partial<AdminApi> = {}): AdminApi {
  return new Proxy(over as AdminApi, {
    get: (target, key: string) => target[key as keyof AdminApi] ?? vi.fn().mockResolvedValue({}),
  });
}

describe('вход в админку', () => {
  it('401 на /admin/session показывает экран входа', async () => {
    const api = fakeApi({
      session: vi.fn().mockRejectedValue(new AdminApiError(401, 'unauthorized')),
    });
    render(<AdminApp createApi={() => api} />);
    expect(await screen.findByRole('button', { name: /Войти через Discord/ })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Разделы' })).toBeNull();
  });

  it('с сессией показывает панель, а 401 позже возвращает к входу', async () => {
    let onUnauthorized = () => {};
    const api = fakeApi({
      session: vi.fn().mockResolvedValue(session),
      draw: vi.fn().mockResolvedValue(draw()),
    });
    render(
      <AdminApp
        createApi={(h) => {
          onUnauthorized = h.onUnauthorized;
          return api;
        }}
      />,
    );
    expect(await screen.findByRole('navigation', { name: 'Разделы' })).toBeInTheDocument();
    onUnauthorized();
    expect(await screen.findByRole('button', { name: /Войти через Discord/ })).toBeInTheDocument();
  });

  it('нейтральные тексты отказа входа', () => {
    expect(loginErrorText(null)).toBeNull();
    expect(loginErrorText('mfa_required')).toBe(loginErrorText('not_allowed'));
    expect(loginErrorText('boom')).toMatch(/Вход не выполнен/);
  });
});

describe('CSRF-заголовок', () => {
  it('добавляется к POST после session(), но не к GET; 401 вызывает onUnauthorized', async () => {
    const onUnauthorized = vi.fn();
    const calls: { url: string; init: RequestInit }[] = [];
    const fetcher = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (calls.length === 4) return new Response('{"error":"unauthorized"}', { status: 401 });
      return new Response(JSON.stringify(url.endsWith('/admin/session') ? session : {}), {
        status: 200,
      });
    });
    const api = createHttpAdminApi({
      fetcher: fetcher as unknown as typeof fetch,
      base: '/b',
      onUnauthorized,
    });
    await api.session();
    await api.freeze('live');
    await api.settings();
    await expect(api.broadcast('live')).rejects.toBeInstanceOf(AdminApiError);
    const header = (i: number) => (calls[i]!.init.headers as Record<string, string>)[CSRF_HEADER];
    expect(header(0)).toBeUndefined();
    expect(header(1)).toBe('csrf-token-1');
    expect(header(2)).toBeUndefined();
    expect(header(3)).toBe('csrf-token-1');
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});

describe('«Рассчитать»', () => {
  it('требует фразу подтверждения и передаёт хэш снимка', async () => {
    const calculate = vi.fn().mockResolvedValue(draw({ status: 'calculated' }));
    const api = fakeApi({ draw: vi.fn().mockResolvedValue(draw()), calculate });
    render(<DrawSection api={api} mode="live" />);
    fireEvent.click(await screen.findByRole('button', { name: /Рассчитать…/ }));
    const submit = await screen.findByRole('button', { name: /^Рассчитать$/ });
    expect(submit).toBeDisabled();
    const input = screen.getByLabelText('Фраза подтверждения');
    await userEvent.type(input, 'расчитать');
    expect(submit).toBeDisabled();
    await userEvent.clear(input);
    await userEvent.type(input, CALCULATE_PHRASE);
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    await waitFor(() => expect(calculate).toHaveBeenCalledWith('live', HASH, CALCULATE_PHRASE));
  });
});

describe('дисквалификация', () => {
  it('требует причину от 3 символов и вызывает API', async () => {
    const winner = {
      id: 'w1',
      place: 3,
      orderIndex: 2,
      ticket: 'K417',
      playerName: 'Steve',
      playerUuid: 'u',
      prizeName: 'Приз',
      imageFile: null,
      status: 'active' as const,
      disqualifyReason: null,
      replacesWinnerId: null,
      totalMinutes: 4000,
    };
    const disqualify = vi.fn().mockResolvedValue({ replacement: null, draw: draw() });
    const api = fakeApi({
      draw: vi.fn().mockResolvedValue(draw({ status: 'calculated', winners: [winner] })),
      disqualify,
    });
    render(<DrawSection api={api} mode="live" />);
    const table = await screen.findByTestId('winners-table');
    fireEvent.click(table.querySelector('button')!);
    const submit = await screen.findByRole('button', { name: 'Дисквалифицировать' });
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByRole('textbox'), 'нарушение');
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    await waitFor(() => expect(disqualify).toHaveBeenCalledWith('live', 'w1', 'нарушение'));
  });
});

describe('метка ТЕСТ', () => {
  it('видна в тестовом режиме панели и скрыта в боевом', async () => {
    render(<AdminPanel api={createMockAdminApi()} session={session} onLogout={() => {}} />);
    expect(screen.queryByTestId('test-badge')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Тест', pressed: false }));
    expect(await screen.findByTestId('test-badge')).toHaveTextContent('ТЕСТ');
  });

  it('без тестового режима переключателя и метки нет', () => {
    render(
      <AdminPanel
        api={createMockAdminApi()}
        session={{ ...session, testModeEnabled: false }}
        onLogout={() => {}}
      />,
    );
    expect(screen.queryByRole('group', { name: 'Режим данных' })).toBeNull();
    expect(screen.queryByTestId('test-badge')).toBeNull();
  });
});
