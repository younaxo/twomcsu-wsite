import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { validateSystemMessage } from '@/lib/admin/communications';
import { ApiError } from '@/lib/api/errors';
import CommunicationsPage from './page';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  granted: new Set<string>(),
}));

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get, post: mocks.post },
}));
vi.mock('@/lib/auth/use-permissions', () => ({
  usePermissions: () => ({
    can: (requirement: string | string[]) =>
      (Array.isArray(requirement) ? requirement : [requirement]).some((key) =>
        mocks.granted.has(key),
      ),
  }),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/communications',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
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

beforeEach(() => {
  mocks.granted.clear();
  mocks.get.mockReset().mockImplementation(async (path: string) => {
    if (path === '/admin/communications/recipients') {
      return [{ id: 'u1', username: 'player1', tag: 'p1', avatar: null }];
    }
    if (path === '/admin/roles') return [];
    return null;
  });
  mocks.post.mockReset();
});

describe('validateSystemMessage', () => {
  it('заголовок и текст обязательны; ссылка — только /… или https://…', () => {
    expect(validateSystemMessage({ title: ' ', message: '', link: '' })).toEqual({
      title: 'Введите заголовок',
      message: 'Введите текст сообщения',
    });
    expect(validateSystemMessage({ title: 'a', message: 'b', link: '/account' })).toEqual({});
    for (const link of ['javascript:alert(1)', '//evil.example', 'http://x.example']) {
      expect(validateSystemMessage({ title: 'a', message: 'b', link }).link).toBeDefined();
    }
  });
});

describe('Коммуникации → Сообщения', () => {
  it('без прав — экран 403; вкладки — по правам', async () => {
    const { unmount } = render(<CommunicationsPage />, { wrapper: Providers });
    expect(screen.queryByRole('tab')).toBeNull();
    unmount();
    mocks.granted.add('communications.messages.send');
    render(<CommunicationsPage />, { wrapper: Providers });
    expect(screen.getByRole('tab', { name: 'Личное сообщение' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Массовая рассылка' })).toBeNull();
  });

  it('личное: поиск получателя → текст → предпросмотр «twomc.su · Системное» → отправка', async () => {
    const user = userEvent.setup();
    mocks.granted.add('communications.messages.send');
    mocks.post.mockResolvedValue({ id: 'n1' });
    render(<CommunicationsPage />, { wrapper: Providers });

    const send = screen.getByRole('button', { name: 'Отправить' });
    expect(send).toBeDisabled();
    await user.click(screen.getByRole('combobox', { name: 'Получатель' }));
    await user.keyboard('play');
    await user.click(await screen.findByRole('option', { name: /player1/ }));
    await user.type(screen.getByLabelText(/Заголовок/), 'Проверка аккаунта');
    await user.type(screen.getByLabelText(/Текст/), 'Здравствуйте!');

    const preview = screen.getByTestId('system-message-preview');
    expect(within(preview).getByTestId('system-sender')).toHaveTextContent('twomc.suСистемное');
    expect(preview).toHaveTextContent('Проверка аккаунта');

    await user.click(send);
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('/admin/communications/messages', {
        userId: 'u1',
        title: 'Проверка аккаунта',
        message: 'Здравствуйте!',
        link: null,
      }),
    );
  });

  it('массовая: проверка числа → подтверждение с числом → отправка с confirmCount; 409 сбрасывает число', async () => {
    const user = userEvent.setup();
    mocks.granted.add('communications.messages.bulk');
    mocks.post.mockImplementation(async (path: string) => {
      if (path.endsWith('/bulk/preview')) return { recipients: 42 };
      throw new ApiError(409, ['Число получателей изменилось']);
    });
    render(<CommunicationsPage />, { wrapper: Providers });

    await user.click(screen.getByRole('radio', { name: /Всем/ }));
    await user.type(screen.getByLabelText(/Заголовок/), 'Обновление');
    await user.type(screen.getByLabelText(/Текст/), 'Сегодня в 20:00.');
    expect(screen.getByRole('button', { name: 'Отправить…' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Проверить получателей' }));
    expect(await screen.findByTestId('bulk-recipients')).toHaveTextContent('42');
    await user.click(screen.getByRole('button', { name: 'Отправить…' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Отправить 42 получателям?');
    expect(dialog).toHaveTextContent('все активные пользователи');

    await user.click(within(dialog).getByRole('button', { name: 'Отправить' }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith(
        '/admin/communications/messages/bulk',
        expect.objectContaining({ audience: { kind: 'all' }, confirmCount: 42 }),
      ),
    );
    // Сервер ответил 409 (аудитория изменилась) — число нужно проверить заново.
    await waitFor(() => expect(screen.queryByTestId('bulk-recipients')).toBeNull());
  });
});
