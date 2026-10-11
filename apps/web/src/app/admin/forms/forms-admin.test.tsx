import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import AdminFormPage from './[id]/page';
import AdminFormsPage from './page';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
  granted: new Set<string>(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get, post: mocks.post, delete: mocks.delete },
}));
vi.mock('@/lib/auth/use-permissions', () => ({
  usePermissions: () => ({
    can: (requirement: string | string[]) =>
      (Array.isArray(requirement) ? requirement : [requirement]).some((key) =>
        mocks.granted.has(key),
      ),
  }),
}));
vi.mock('@/components/ui/toast', () => ({ toast: mocks.toast }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/forms',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ id: 'f1' }),
}));

const FORM = {
  id: 'f1',
  slug: 'builder-app',
  title: 'Заявка в строители',
  status: 'PUBLISHED',
  visibility: 'PUBLIC',
  createdAt: '2026-10-01T10:00:00.000Z',
  _count: { fields: 2, responses: 5 },
};
const DRAFT = {
  ...FORM,
  id: 'f2',
  title: 'Опрос',
  status: 'DRAFT',
  _count: { fields: 0, responses: 0 },
};
const FIELDS = [
  { id: 'q1', label: 'Ник в игре', type: 'TEXT', order: 0 },
  { id: 'q2', label: 'Опыт', type: 'RADIO', order: 1 },
];
const RESPONSE = {
  id: 'r1',
  isAnonymous: false,
  isComplete: true,
  createdAt: '2026-10-02T10:00:00.000Z',
  completedAt: '2026-10-02T10:05:00.000Z',
  respondent: { id: 'u1', username: 'builder', tag: 'builder#0042' },
  answers: [
    {
      fieldId: 'q1',
      textValue: 'Builder42',
      numberValue: null,
      booleanValue: null,
      dateValue: null,
      jsonValue: null,
      fileUrls: [],
    },
    {
      fieldId: 'q2',
      textValue: 'Больше года',
      numberValue: null,
      booleanValue: null,
      dateValue: null,
      jsonValue: null,
      fileUrls: [],
    },
  ],
};
const ANONYMOUS = { ...RESPONSE, id: 'r2', isAnonymous: true, isComplete: false, respondent: null };

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
  mocks.granted.clear();
  for (const fn of [mocks.get, mocks.post, mocks.delete]) fn.mockReset();
  mocks.post.mockResolvedValue({ id: 'f3' });
  mocks.delete.mockResolvedValue(undefined);
  mocks.get.mockImplementation(async (path: string) => {
    if (path === '/admin/forms') return { items: [FORM, DRAFT], total: 2 };
    if (path === '/admin/forms/f1') return { ...FORM, fields: FIELDS };
    if (path === '/admin/forms/f1/responses') return { items: [RESPONSE, ANONYMOUS], total: 2 };
    if (path === '/admin/forms/f1/stats') {
      return {
        totalResponses: 5,
        completeResponses: 4,
        completionRate: 0.8,
        maxResponses: null,
        fieldStats: [
          { fieldId: 'q1', label: 'Ник в игре', answeredCount: 4, breakdown: {} },
          {
            fieldId: 'q2',
            label: 'Опыт',
            answeredCount: 4,
            breakdown: { 'Больше года': 3, Новичок: 1 },
          },
        ],
      };
    }
    return [];
  });
});

describe('Формы в админке (срез 7.4)', () => {
  it('список: статус и счётчики; действия по правам', async () => {
    const user = userEvent.setup();
    for (const key of ['forms.view', 'forms.publish', 'forms.close', 'forms.duplicate']) {
      mocks.granted.add(key);
    }
    render(<AdminFormsPage />, { wrapper: Providers });
    const rows = within(await screen.findByTestId('admin-forms')).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('полей: 2 · ответов: 5');
    expect(within(rows[0]!).queryByRole('link')).toBeNull();
    expect(within(rows[0]!).queryByRole('button', { name: 'Опубликовать' })).toBeNull();
    await user.click(within(rows[0]!).getByRole('button', { name: 'Закрыть' }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/admin/forms/f1/close'));
    await user.click(within(rows[1]!).getByRole('button', { name: 'Опубликовать' }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/admin/forms/f2/publish'));
    await user.click(within(rows[1]!).getByRole('button', { name: 'Копия' }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/admin/forms/f2/duplicate'));
    expect(screen.queryByRole('button', { name: 'Удалить' })).toBeNull();
  });

  it('удаление формы называет число ответов', async () => {
    const user = userEvent.setup();
    mocks.granted.add('forms.view');
    mocks.granted.add('forms.delete');
    render(<AdminFormsPage />, { wrapper: Providers });
    const rows = within(await screen.findByTestId('admin-forms')).getAllByRole('listitem');
    await user.click(within(rows[0]!).getByRole('button', { name: 'Удалить' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('удалятся все ответы (5)');
    await user.click(within(dialog).getByRole('button', { name: 'Удалить' }));
    await waitFor(() => expect(mocks.delete).toHaveBeenCalledWith('/admin/forms/f1'));
  });

  it('ответы: автор или «Анонимно», незавершённый помечен, карточка по полям', async () => {
    const user = userEvent.setup();
    mocks.granted.add('forms.responses');
    render(<AdminFormPage />, { wrapper: Providers });
    const list = await screen.findByTestId('form-responses');
    const rows = within(list).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('builder#0042');
    expect(rows[1]).toHaveTextContent('Анонимно');
    expect(within(rows[1]!).getByText('Не завершён')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Статистика' })).toBeNull();
    await user.click(within(rows[0]!).getByRole('button', { name: 'Открыть' }));
    const card = await screen.findByTestId('form-response');
    expect(card).toHaveTextContent('Ник в игре');
    expect(card).toHaveTextContent('Builder42');
    expect(card).toHaveTextContent('Больше года');
  });

  it('статистика: доля завершённых и разбивка по вариантам', async () => {
    const user = userEvent.setup();
    mocks.granted.add('forms.responses');
    mocks.granted.add('forms.stats');
    render(<AdminFormPage />, { wrapper: Providers });
    await user.click(await screen.findByRole('tab', { name: 'Статистика' }));
    const stats = await screen.findByTestId('form-stats');
    expect(stats).toHaveTextContent('Ответов: 5 · завершено: 4 (80%)');
    expect(stats).toHaveTextContent('Больше года');
    expect(stats).toHaveTextContent('Новичок');
  });
});
