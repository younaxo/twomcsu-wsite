import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ApiError } from '@/lib/api/errors';
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
  it('список: все 6 типов (в т. ч. донат), свои обращения со ссылками', async () => {
    mocks.get.mockResolvedValue({ items: [REPORT], total: 1, page: 1, limit: 20 });
    render(<SupportPage />, { wrapper: Providers });
    const types = screen.getByTestId('report-types');
    expect(within(types).getAllByRole('link')).toHaveLength(6);
    expect(within(types).getByRole('link', { name: /Проблема с донатом/ })).toHaveAttribute(
      'href',
      '/support/new/donation_problem',
    );
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

  it('неизвестный тип — «типа нет»', () => {
    mocks.params = { type: 'constructor' };
    render(<NewReportPage />, { wrapper: Providers });
    expect(screen.getByText('Такого типа обращения нет')).toBeInTheDocument();
  });

  it('донат: отдельная форма без ника, POST /support/donation-problem', async () => {
    const user = userEvent.setup();
    mocks.params = { type: 'donation_problem' };
    mocks.post.mockResolvedValue({ reportNumber: 'R-0004' });
    render(<NewReportPage />, { wrapper: Providers });
    expect(screen.queryByLabelText(/Ник нарушителя/)).toBeNull();
    await user.type(screen.getByLabelText(/Описание/), 'Не выдали привилегию');
    await user.type(screen.getByLabelText(/Дата платежа/), '2026-10-01');
    await user.click(screen.getByRole('button', { name: 'Отправить обращение' }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('/support/donation-problem', {
        description: 'Не выдали привилегию',
        paymentDate: '2026-10-01',
      }),
    );
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/support/R-0004'));
  });

  it('обжалование: выбор наказания, appealedPunishmentId без целей; необжалуемые скрыты', async () => {
    const user = userEvent.setup();
    mocks.params = { type: 'punishment_appeal' };
    mocks.get.mockResolvedValue([
      {
        id: 'p1',
        punishmentType: 'TEMPBAN',
        reason: 'Читы',
        duration: '7d',
        server: null,
        issuedAt: '2026-10-01T10:00:00.000Z',
        expiresAt: null,
        isActive: true,
        isAppealable: true,
      },
      {
        id: 'p2',
        punishmentType: 'MUTE',
        reason: 'Нельзя обжаловать',
        duration: null,
        server: null,
        issuedAt: '2026-10-02T10:00:00.000Z',
        expiresAt: null,
        isActive: false,
        isAppealable: false,
      },
    ]);
    mocks.post.mockResolvedValue({ reportNumber: 'R-0005' });
    render(<NewReportPage />, { wrapper: Providers });
    const select = await screen.findByLabelText(/Наказание/);
    expect(within(select).queryByText(/Нельзя обжаловать/)).toBeNull();
    expect(screen.queryByLabelText(/Ник нарушителя/)).toBeNull();
    await user.type(screen.getByLabelText(/Описание/), 'Не согласен');
    await user.click(screen.getByRole('button', { name: 'Отправить обращение' }));
    expect(screen.getByText('Выберите наказание, которое обжалуете.')).toBeInTheDocument();
    expect(mocks.post).not.toHaveBeenCalled();
    await user.selectOptions(select, 'p1');
    await user.click(screen.getByRole('button', { name: 'Отправить обращение' }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('/reports', {
        type: 'PUNISHMENT_APPEAL',
        description: 'Не согласен',
        targets: [],
        appealedPunishmentId: 'p1',
      }),
    );
  });

  it('обжалование: нет обжалуемых наказаний — пояснение, отправка недоступна', async () => {
    mocks.params = { type: 'punishment_appeal' };
    mocks.get.mockResolvedValue([]);
    render(<NewReportPage />, { wrapper: Providers });
    expect(await screen.findByTestId('no-punishments')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Отправить обращение' })).toBeDisabled();
  });

  it('прочие типы не шлют appealedPunishmentId; 409 показывается понятным текстом', async () => {
    const user = userEvent.setup();
    mocks.params = { type: 'other' };
    mocks.post.mockRejectedValue(new ApiError(409, ['Конфликт данных']));
    render(<NewReportPage />, { wrapper: Providers });
    await user.type(screen.getByLabelText(/Описание/), 'Вопрос');
    await user.click(screen.getByRole('button', { name: 'Отправить обращение' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/уже есть открытое обращение/);
    const call = mocks.post.mock.calls[0]!;
    expect(call[1]).not.toHaveProperty('appealedPunishmentId');
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

  it('заблокированное персоналом: поле ввода скрыто, причина видна, правки нет', async () => {
    mocks.params = { reportNumber: 'R-0001' };
    mocks.get.mockResolvedValue({ ...REPORT, isLocked: true, lockedReason: 'Спам' });
    render(<ReportPage />, { wrapper: Providers });
    await screen.findByTestId('report-view');
    expect(screen.getByTestId('reply-blocked')).toHaveTextContent(/Спам/);
    expect(screen.queryByLabelText('Ответ')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Изменить сообщение' })).toBeNull();
  });

  it('отправка ответа: 403 от сервера — понятное сообщение в toast', async () => {
    const user = userEvent.setup();
    mocks.params = { reportNumber: 'R-0001' };
    mocks.get.mockResolvedValue(REPORT);
    mocks.post.mockRejectedValue(new ApiError(403, ['Недостаточно прав']));
    render(<ReportPage />, { wrapper: Providers });
    await screen.findByTestId('report-view');
    await user.type(screen.getByLabelText('Ответ'), 'Привет');
    await user.click(screen.getByRole('button', { name: 'Ответить' }));
    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith(
        expect.stringMatching(/закрыто, заблокировано/),
      ),
    );
  });

  it('несуществующее обращение (404) — «не найдено»', async () => {
    mocks.params = { reportNumber: 'R-9' };
    mocks.get.mockRejectedValue(new ApiError(404, ['Обращение не найдено']));
    render(<ReportPage />, { wrapper: Providers });
    expect(await screen.findByText('Обращение не найдено')).toBeInTheDocument();
  });

  it('детали: ход обращения и обжалуемое наказание', async () => {
    mocks.params = { reportNumber: 'R-0001' };
    mocks.get.mockResolvedValue({
      ...REPORT,
      status: 'RESOLVED',
      resolvedAt: '2026-10-11T10:00:00.000Z',
      appealedPunishment: { id: 'p1', punishmentType: 'PERMBAN', reason: 'Читы' },
    });
    render(<ReportPage />, { wrapper: Providers });
    await screen.findByTestId('report-view');
    expect(within(screen.getByTestId('report-timeline')).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByTestId('appealed-punishment')).toHaveTextContent('Бан навсегда');
  });
});
