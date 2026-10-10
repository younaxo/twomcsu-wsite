import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ApiError } from '@/lib/api/errors';
import { useAuthStore } from '@/lib/auth/store';
import FormPage from './[slug]/page';
import InviteFormPage from './invite/[code]/page';
import FormsPage from './page';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  params: {} as Record<string, string>,
  routes: {} as Record<string, unknown>,
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get, post: mocks.post },
}));
vi.mock('@/components/ui/toast', () => ({ toast: mocks.toast }));
vi.mock('next/navigation', () => ({
  useParams: () => mocks.params,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/forms',
}));

const field = (id: string, type: string, extra: Record<string, unknown> = {}) => ({
  id,
  type,
  label: `Поле ${id}`,
  description: null,
  placeholder: null,
  isRequired: false,
  order: Number(id.replace(/\D/g, '')) || 0,
  stepIndex: null,
  options: null,
  defaultValue: null,
  minValue: null,
  maxValue: null,
  minLength: null,
  maxLength: null,
  maxFiles: null,
  metadata: null,
  ...extra,
});

const FORM = {
  id: 'form1',
  slug: 'staff',
  title: 'Набор в команду',
  description: 'Расскажите **о себе**',
  visibility: 'PUBLIC',
  requiresAuth: false,
  onePerUser: true,
  isAnonymous: false,
  requiresCaptcha: false,
  opensAt: null,
  closesAt: null,
  maxResponses: null,
  responsesCount: 0,
  multiStep: false,
  thankYouMessage: 'Ждите ответа в Discord',
  redirectUrl: 'javascript:alert(1)',
  createdAt: '2026-10-01T00:00:00.000Z',
  fields: [
    field('f1', 'TEXT', { label: 'Ник', isRequired: true }),
    field('f2', 'RADIO', { label: 'Роль', options: ['Хелпер', 'Строитель'], isRequired: true }),
    field('f3', 'CHECKBOX', { label: 'Режимы', options: ['PVP', 'PVE'] }),
    field('f4', 'EMAIL', { label: 'Почта' }),
    field('f5', 'RATING', { label: 'Оценка', maxValue: 5 }),
    field('f6', 'FILE_UPLOAD', { label: 'Скриншоты' }),
    field('f7', 'AGREEMENT_CHECKLIST', {
      label: 'Правила',
      description: 'С правилами согласен',
      isRequired: true,
    }),
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
  mocks.get.mockReset();
  mocks.post.mockReset();
  mocks.post.mockResolvedValue({ id: 'resp1' });
  mocks.params = {};
  mocks.routes = {};
  mocks.get.mockImplementation((path: string) => {
    const value = mocks.routes[path];
    if (value instanceof Error) return Promise.reject(value);
    return Promise.resolve(value ?? {});
  });
  useAuthStore.setState({ status: 'anonymous', user: null } as never);
});

const signIn = () =>
  useAuthStore.setState({
    status: 'authenticated',
    user: { id: 'me', username: 'Steve' } as never,
  });

describe('Формы (срез 3.6)', () => {
  it('список: ссылки на формы и «Мои ответы» с черновиком', async () => {
    signIn();
    mocks.routes['/forms'] = [FORM];
    mocks.routes['/forms/my/responses'] = [
      {
        id: 'd1',
        formId: 'form1',
        isComplete: false,
        currentStep: 0,
        createdAt: '2026-10-02T00:00:00.000Z',
        completedAt: null,
        form: { id: 'form1', slug: 'staff', title: 'Набор в команду' },
        answers: [],
      },
    ];
    render(<FormsPage />, { wrapper: Providers });
    const list = await screen.findByTestId('forms-list');
    expect(within(list).getByRole('link')).toHaveAttribute('href', '/forms/staff');
    const mine = await screen.findByTestId('my-form-responses');
    expect(within(mine).getByText('Черновик')).toBeInTheDocument();
  });

  it('гость: обязательные поля, отправка ответов по типам, «спасибо» без небезопасной ссылки', async () => {
    const user = userEvent.setup();
    mocks.params = { slug: 'staff' };
    mocks.routes['/forms/staff'] = FORM;
    render(<FormPage />, { wrapper: Providers });
    await screen.findByTestId('form-filler');
    expect(screen.getByText('о себе').tagName).toBe('STRONG');
    expect(screen.getByText(/Загрузка файлов пока недоступна/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Сохранить черновик' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Отправить' }));
    expect(screen.getAllByText('Обязательное поле')).toHaveLength(3);
    expect(mocks.post).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/Ник/), 'Steve');
    await user.click(screen.getByRole('radio', { name: 'Строитель' }));
    await user.click(screen.getByRole('checkbox', { name: 'PVE' }));
    await user.click(screen.getByRole('radio', { name: 'Оценка 4' }));
    await user.click(screen.getByRole('checkbox', { name: 'С правилами согласен' }));
    await user.click(screen.getByRole('button', { name: 'Отправить' }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('/forms/staff/responses', {
        answers: [
          { fieldId: 'f1', value: 'Steve' },
          { fieldId: 'f2', value: 'Строитель' },
          { fieldId: 'f3', value: ['PVE'] },
          { fieldId: 'f5', value: 4 },
          { fieldId: 'f7', value: true },
        ],
      }),
    );
    expect(await screen.findByText('Ждите ответа в Discord')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Продолжить' })).toBeNull();
  });

  it('вошедший: черновик и автозаполнение email, сохранение черновика', async () => {
    const user = userEvent.setup();
    signIn();
    mocks.params = { slug: 'staff' };
    mocks.routes['/forms/staff'] = FORM;
    mocks.routes['/forms/autofill'] = { username: 'Steve', email: 'steve@example.com' };
    mocks.routes['/forms/my/responses'] = [
      {
        id: 'd1',
        formId: 'form1',
        isComplete: false,
        currentStep: 0,
        createdAt: '2026-10-02T00:00:00.000Z',
        completedAt: null,
        form: { id: 'form1', slug: 'staff', title: 'Набор в команду' },
        answers: [
          {
            fieldId: 'f1',
            textValue: 'Steve_Draft',
            numberValue: null,
            booleanValue: null,
            dateValue: null,
            jsonValue: null,
            fileUrls: [],
          },
        ],
      },
    ];
    render(<FormPage />, { wrapper: Providers });
    expect(await screen.findByDisplayValue('Steve_Draft')).toBeInTheDocument();
    expect(screen.getByDisplayValue('steve@example.com')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Сохранить черновик' }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('/forms/staff/responses/save-draft', {
        answers: [
          { fieldId: 'f4', value: 'steve@example.com' },
          { fieldId: 'f1', value: 'Steve_Draft' },
        ],
        currentStep: 0,
      }),
    );
    expect(mocks.toast.success).toHaveBeenCalledWith('Черновик сохранён');
  });

  it('уже отвечал — форма не показывается; нужна авторизация — ссылка «Войти»', async () => {
    signIn();
    mocks.params = { slug: 'staff' };
    mocks.routes['/forms/staff'] = FORM;
    mocks.routes['/forms/autofill'] = { username: 'Steve', email: null };
    mocks.routes['/forms/my/responses'] = [
      {
        id: 'r1',
        formId: 'form1',
        isComplete: true,
        currentStep: null,
        createdAt: '2026-10-02T00:00:00.000Z',
        completedAt: '2026-10-02T00:00:00.000Z',
        form: { id: 'form1', slug: 'staff', title: 'Набор в команду' },
        answers: [],
      },
    ];
    const view = render(<FormPage />, { wrapper: Providers });
    expect(await screen.findByTestId('form-blocked')).toHaveTextContent(
      'Вы уже отправили ответ на эту форму.',
    );
    view.unmount();

    useAuthStore.setState({ status: 'anonymous', user: null } as never);
    mocks.routes['/forms/staff'] = { ...FORM, requiresAuth: true };
    render(<FormPage />, { wrapper: Providers });
    const blocked = await screen.findByTestId('form-blocked');
    expect(within(blocked).getByRole('link', { name: 'Войти' })).toHaveAttribute(
      'href',
      '/login?next=%2Fforms%2Fstaff',
    );
  });

  it('многошаговая форма: «Далее» проверяет шаг', async () => {
    const user = userEvent.setup();
    mocks.params = { slug: 'steps' };
    mocks.routes['/forms/steps'] = {
      ...FORM,
      slug: 'steps',
      multiStep: true,
      fields: [
        field('f1', 'TEXT', { label: 'Ник', isRequired: true, stepIndex: 0 }),
        field('f2', 'TEXTAREA', { label: 'О себе', stepIndex: 1 }),
      ],
    };
    render(<FormPage />, { wrapper: Providers });
    expect(await screen.findByTestId('form-step')).toHaveTextContent('Шаг 1 из 2');
    await user.click(screen.getByRole('button', { name: 'Далее' }));
    expect(screen.getByText('Обязательное поле')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Ник/), 'Steve');
    await user.click(screen.getByRole('button', { name: 'Далее' }));
    expect(screen.getByTestId('form-step')).toHaveTextContent('Шаг 2 из 2');
    expect(screen.getByLabelText(/О себе/)).toBeInTheDocument();
  });

  it('приглашение: код уходит при отправке; недействительное — понятное состояние', async () => {
    const user = userEvent.setup();
    mocks.params = { code: 'abc' };
    mocks.routes['/forms/invite/abc'] = {
      ...FORM,
      visibility: 'INVITE_ONLY',
      fields: [field('f1', 'TEXT', { label: 'Ник', isRequired: true })],
    };
    const view = render(<InviteFormPage />, { wrapper: Providers });
    await user.type(await screen.findByLabelText(/Ник/), 'Steve');
    await user.click(screen.getByRole('button', { name: 'Отправить' }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('/forms/staff/responses', {
        answers: [{ fieldId: 'f1', value: 'Steve' }],
        inviteCode: 'abc',
      }),
    );
    view.unmount();

    mocks.params = { code: 'old' };
    mocks.routes['/forms/invite/old'] = new ApiError(403, ['Приглашение истекло']);
    render(<InviteFormPage />, { wrapper: Providers });
    expect(await screen.findByText('Приглашение недействительно')).toBeInTheDocument();
    expect(screen.getByText('Приглашение истекло')).toBeInTheDocument();
  });
});
