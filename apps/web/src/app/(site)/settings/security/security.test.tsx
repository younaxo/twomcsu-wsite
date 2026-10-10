import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { describeDevice } from '@/lib/account/device';
import { useAuthStore } from '@/lib/auth/store';
import SecuritySettingsPage from './page';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
  replace: vi.fn(),
  clear: vi.fn(),
}));

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get, post: mocks.post, delete: mocks.delete },
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/settings/security',
  useRouter: () => ({ push: vi.fn(), replace: mocks.replace }),
}));

function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
}

const CHROME_WIN =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';
const SAFARI_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.get.mockResolvedValue([
    {
      id: 's1',
      userAgent: CHROME_WIN,
      ipAddress: '10.0.0.1',
      createdAt: '2026-10-01T10:00:00.000Z',
      expiresAt: '2026-11-01T10:00:00.000Z',
    },
  ]);
  mocks.post.mockResolvedValue({ success: true });
  mocks.delete.mockResolvedValue({ success: true });
  useAuthStore.setState({
    status: 'authenticated',
    user: { id: 'u1', username: 'player' } as never,
    clear: mocks.clear,
  });
});

describe('describeDevice', () => {
  it('браузер и система из User-Agent', () => {
    expect(describeDevice(CHROME_WIN)).toEqual({ label: 'Chrome, Windows', mobile: false });
    expect(describeDevice(SAFARI_IOS)).toEqual({ label: 'Safari, iOS', mobile: true });
    expect(describeDevice(null).label).toBe('Неизвестное устройство');
  });
});

describe('Настройки → Безопасность', () => {
  it('смена пароля: проверка совпадения, отправка без повтора на 401', async () => {
    const user = userEvent.setup();
    render(<SecuritySettingsPage />, { wrapper: Providers });
    const submit = await screen.findByRole('button', { name: 'Изменить пароль' });
    await user.type(screen.getByLabelText(/Текущий пароль/), 'old-password');
    await user.type(screen.getByLabelText(/Новый пароль/), 'new-password-1');
    await user.type(screen.getByLabelText(/Повторите пароль/), 'new-password-2');
    expect(screen.getByText('Пароли не совпадают')).toBeInTheDocument();
    expect(submit).toBeDisabled();
    await user.clear(screen.getByLabelText(/Повторите пароль/));
    await user.type(screen.getByLabelText(/Повторите пароль/), 'new-password-1');
    await user.click(submit);
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith(
        '/auth/change-password',
        { currentPassword: 'old-password', newPassword: 'new-password-1' },
        { retryOn401: false },
      ),
    );
  });

  it('сессии: завершить одну; «выйти везде» — после подтверждения и на вход', async () => {
    const user = userEvent.setup();
    render(<SecuritySettingsPage />, { wrapper: Providers });
    const list = await screen.findByTestId('sessions');
    expect(list).toHaveTextContent('Chrome, Windows');
    await user.click(within(list).getByRole('button', { name: 'Завершить' }));
    await waitFor(() => expect(mocks.delete).toHaveBeenCalledWith('/auth/sessions/s1'));

    await user.click(screen.getByRole('button', { name: /Выйти на всех устройствах/ }));
    const dialog = await screen.findByRole('alertdialog');
    expect(mocks.delete).not.toHaveBeenCalledWith('/auth/sessions');
    await user.click(within(dialog).getByRole('button', { name: 'Выйти везде' }));
    await waitFor(() => expect(mocks.delete).toHaveBeenCalledWith('/auth/sessions'));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/login'));
    expect(mocks.clear).toHaveBeenCalled();
  });
});
