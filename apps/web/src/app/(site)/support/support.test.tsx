import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useAuthStore } from '@/lib/auth/store';
import ReportPage from './[reportNumber]/page';
import NewReportPage from './new/[type]/page';
import SupportPage from './page';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  push: vi.fn(),
  params: {} as Record<string, string>,
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get, post: mocks.post, patch: mocks.patch },
}));
vi.mock('@/components/ui/toast', () => ({ toast: mocks.toast }));
vi.mock('next/navigation', () => ({
  useParams: () => mocks.params,
  useRouter: () => ({ push: mocks.push, replace: vi.fn() }),
  usePathname: () => '/support',
}));

const REPORT = {
  id: 'r1',
  reportNumber: 'R-0001',
  type: 'PUNISHMENT_APPEAL',
  status: 'WAITING_RESPONSE',
  description: 'Прошу снять бан',
  createdAt: '2026-10-10T10:00:00.000Z',
  verdict: null,
  targets: [],
  messages: [
    {
      id: 'm1',
      authorId: 'staff',
      content: 'Уточните ник',
      isStaff: true,
      isSystem: false,
      isDeleted: false,
      createdAt: '2026-10-10T11:00:00.000Z',
    },
    {
      id: 'm2',
      authorId: 'me',
      content: 'Мой ник Steve',
      isStaff: false,
      isSystem: false,
      isDeleted: false,
      createdAt: '2026-10-10T12:00:00.000Z',
    },
  ],
};

function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <TooltipProvider delayDuration={0}>{children}</TooltipProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  for (const fn of [mocks.get, mocks.post, mocks.patch, mocks.push]) fn.mockReset();
  mocks.post.mockResolvedValue({});
  mocks.patch.mockResolvedValue({});
  mocks.params = {};
  useAuthStore.setState({ status: 'authenticated', user: { id: 'me' } as never });
});

describe('Обращения (срез 3.5)', () => {
  it('список: типы без «Проблемы с донатом», свои обращения со ссылками', async () => {
    mocks.get.mockResolvedValue({ items: [REPORT] });
    render(<SupportPage />, { wrapper: Providers });
    const types = screen.getByTestId('report-types');
    expect(within(types).getAllByRole('link')).toHaveLength(5);
    expect(within(types).queryByText(/донат/i)).toBeNull();
    expect(within(types).getByRole('link', { name: /Жалоба на игрока/ })).toHaveAttribute(
      'href',
      '/support/new/player_complaint',
    );
    const mine = await screen.findByTestId('my-reports');
    expect(within(mine).getByRole('link')).toHaveAttribute('href', '/support/R-0001');
    expect(within(mine).getByText('Ждёт вашего ответа')).toBeInTheDocument();
  });

  it('жалоба: без ника не отправляется; с ником — POST и переход к обращению', async () => {
    const user = userEvent.setup();
    mocks.params = { type: 'player_complaint' };
    mocks.post.mockResolvedValue({ reportNumber: 'R-0002' });
    render(<NewReportPage />, { wrapper: Providers });
    await user.type(screen.getByLabelText(/Описание/), 'Гриферил дом');
    await user.click(screen.getByRole('button', { name: 'Отправить обращение' }));
    expect(screen.getByText('Укажите ник нарушителя.')).toBeInTheDocument();
    expect(mocks.post).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText(/Ник нарушителя/), 'Griefer');
    await user.click(screen.getByRole('button', { name: 'Отправить обращение' }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('/reports', {
        type: 'PLAYER_COMPLAINT',
        description: 'Гриферил дом',
        targets: [{ username: 'Griefer' }],
      }),
    );
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/support/R-0002'));
  });

  it('техническая проблема: поля ника нет, цели пустые', async () => {
    const user = userEvent.setup();
    mocks.params = { type: 'technical_issue' };
    mocks.post.mockResolvedValue({ reportNumber: 'R-0003' });
    render(<NewReportPage />, { wrapper: Providers });
    expect(screen.queryByLabelText(/Ник нарушителя/)).toBeNull();
    await user.type(screen.getByLabelText(/Описание/), 'Не грузится карта');
    await user.click(screen.getByRole('button', { name: 'Отправить обращение' }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('/reports', {
        type: 'TECHNICAL_ISSUE',
        description: 'Не грузится карта',
        targets: [],
      }),
    );
  });

  it('неизвестный тип и донат — «типа нет»', () => {
    mocks.params = { type: 'donation_problem' };
    render(<NewReportPage />, { wrapper: Providers });
    expect(screen.getByText('Такого типа обращения нет')).toBeInTheDocument();
  });

  it('обращение: переписка, ответ и правка только своего сообщения', async () => {
    const user = userEvent.setup();
    mocks.params = { reportNumber: 'R-0001' };
    mocks.get.mockResolvedValue(REPORT);
    render(<ReportPage />, { wrapper: Providers });
    await screen.findByTestId('report-view');
    const messages = screen.getAllByTestId('report-message');
    expect(messages).toHaveLength(2);
    expect(within(messages[0]!).queryByRole('button', { name: 'Изменить сообщение' })).toBeNull();
    await user.click(within(messages[1]!).getByRole('button', { name: 'Изменить сообщение' }));
    const draft = screen.getByLabelText('Текст сообщения');
    await user.clear(draft);
    await user.type(draft, 'Мой ник Alex');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith('/reports/R-0001/messages/m2', {
        content: 'Мой ник Alex',
      }),
    );
    await user.type(screen.getByLabelText('Ответ'), 'Жду решения');
    await user.click(screen.getByRole('button', { name: 'Ответить' }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('/reports/R-0001/messages', {
        content: 'Жду решения',
      }),
    );
  });

  it('закрытое обращение: решение видно, ответить нельзя', async () => {
    mocks.params = { reportNumber: 'R-0001' };
    mocks.get.mockResolvedValue({ ...REPORT, status: 'RESOLVED', verdict: 'Бан снят' });
    render(<ReportPage />, { wrapper: Providers });
    await screen.findByTestId('report-view');
    expect(screen.getByText('Бан снят')).toBeInTheDocument();
    expect(screen.getByText('Обращение закрыто — ответить нельзя.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Ответ')).toBeNull();
  });
});
