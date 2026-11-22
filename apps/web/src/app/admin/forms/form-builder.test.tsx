import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  createPayload,
  emptyDraft,
  optionsOf,
  toDraft,
  updatePayload,
} from '@/lib/admin/form-builder';
import EditFormPage from './[id]/edit/page';
import NewFormPage from './new/page';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  push: vi.fn(),
  granted: new Set<string>(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get, post: mocks.post, patch: mocks.patch },
}));
vi.mock('@/lib/auth/use-permissions', () => ({
  usePermissions: () => ({
    can: (requirement: string | string[] | { allOf: string[] }) => {
      if (typeof requirement === 'object' && !Array.isArray(requirement)) {
        return requirement.allOf.every((key) => mocks.granted.has(key));
      }
      return (Array.isArray(requirement) ? requirement : [requirement]).some((key) =>
        mocks.granted.has(key),
      );
    },
  }),
}));
vi.mock('@/components/ui/toast', () => ({ toast: mocks.toast }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/forms/new',
  useRouter: () => ({ push: mocks.push, replace: vi.fn() }),
  useParams: () => ({ id: 'f1' }),
}));

const SERVER_FORM = {
  id: 'f1',
  slug: 'builder-app',
  title: 'Заявка в строители',
  description: 'Расскажите о себе',
  status: 'DRAFT',
  visibility: 'AUTHENTICATED',
  requiresAuth: true,
  onePerUser: true,
  isAnonymous: false,
  thankYouMessage: 'Спасибо!',
  responsesCount: 0,
  createdAt: '2026-10-01T10:00:00.000Z',
  fields: [
    {
      id: 'q2',
      label: 'Опыт',
      type: 'RADIO',
      order: 1,
      description: null,
      placeholder: null,
      isRequired: true,
      options: ['Новичок', 'Больше года'],
      minLength: null,
      maxLength: 50,
      validation: { pattern: 'x' },
    },
    {
      id: 'q1',
      label: 'Ник',
      type: 'TEXT',
      order: 0,
      description: 'Как в игре',
      placeholder: 'Steve',
      isRequired: true,
      options: null,
      minLength: 3,
      maxLength: 16,
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
  mocks.granted.clear();
  for (const fn of [mocks.get, mocks.post, mocks.patch, mocks.push]) fn.mockReset();
  mocks.post.mockResolvedValue({ id: 'f9' });
  mocks.patch.mockResolvedValue({});
  mocks.get.mockImplementation(async () => structuredClone(SERVER_FORM));
});

describe('логика конструктора форм', () => {
  it('toDraft сортирует по порядку и сохраняет служебные свойства полей', () => {
    const draft = toDraft(structuredClone(SERVER_FORM) as never);
    expect(draft.fields.map((f) => f.label)).toEqual(['Ник', 'Опыт']);
    expect(draft.fields[0]!.extra).toEqual({ minLength: 3, maxLength: 16 });
    expect(draft.fields[1]!.extra).toEqual({ maxLength: 50, validation: { pattern: 'x' } });
    const payload = updatePayload(draft, true) as { fields: Array<Record<string, unknown>> };
    expect(payload.fields[0]).toMatchObject({
      type: 'TEXT',
      order: 0,
      minLength: 3,
      maxLength: 16,
    });
    expect(payload.fields[1]).toMatchObject({
      type: 'RADIO',
      order: 1,
      options: ['Новичок', 'Больше года'],
      validation: { pattern: 'x' },
    });
  });

  it('у формы с ответами поля в PATCH не уходят', () => {
    const draft = toDraft(structuredClone(SERVER_FORM) as never);
    expect(updatePayload(draft, false)).not.toHaveProperty('fields');
  });

  it('варианты: пустые и повторы отбрасываются', () => {
    const draft = emptyDraft();
    const field = { ...draft.fields[0]!, optionsText: ' а \n\nб\nа' };
    expect(optionsOf(field)).toEqual(['а', 'б']);
  });

  it('createPayload содержит slug и поля по порядку', () => {
    const draft = emptyDraft();
    draft.settings.slug = 'apply';
    draft.settings.title = 'Анкета';
    draft.fields[0]!.label = 'Ник';
    expect(createPayload(draft)).toMatchObject({
      slug: 'apply',
      title: 'Анкета',
      fields: [{ type: 'TEXT', label: 'Ник', order: 0, isRequired: false }],
    });
  });
});

describe('Конструктор форм: создание', () => {
  it('без права forms.create — 403', () => {
    render(<NewFormPage />, { wrapper: Providers });
    expect(screen.queryByRole('tab', { name: 'Редактор' })).toBeNull();
  });

  it('валидация, поля, порядок, предпросмотр и POST', async () => {
    const user = userEvent.setup();
    mocks.granted.add('forms.create');
    render(<NewFormPage />, { wrapper: Providers });

    await user.click(await screen.findByRole('button', { name: 'Создать черновик' }));
    expect(await screen.findByText('Введите название')).toBeInTheDocument();
    expect(screen.getByText('Введите вопрос')).toBeInTheDocument();
    expect(mocks.post).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/Название/), 'Заявка');
    await user.type(screen.getByLabelText(/Адрес \(slug\)/), 'apply');
    await user.type(screen.getAllByLabelText(/Вопрос/)[0]!, 'Ваш ник');

    await user.click(screen.getByRole('button', { name: 'Добавить поле' }));
    const cards = screen.getAllByTestId('builder-field');
    expect(cards).toHaveLength(2);
    await user.type(within(cards[1]!).getByLabelText(/Вопрос/), 'Опыт');
    await user.selectOptions(within(cards[1]!).getByLabelText('Тип поля'), 'RADIO');
    // варианты обязательны для списка
    await user.click(screen.getByRole('button', { name: 'Создать черновик' }));
    expect(await screen.findByText('Добавьте хотя бы один вариант')).toBeInTheDocument();
    await user.type(within(cards[1]!).getByLabelText(/Варианты/), 'Новичок{Enter}Профи');

    await user.click(screen.getByRole('button', { name: 'Поднять поле 2' }));
    const reordered = screen.getAllByTestId('builder-field');
    expect(within(reordered[0]!).getByLabelText(/Вопрос/)).toHaveValue('Опыт');

    await user.click(screen.getByRole('tab', { name: 'Предпросмотр' }));
    const preview = await screen.findByTestId('builder-preview');
    expect(preview).toHaveTextContent('Заявка');
    expect(within(preview).getByText('Опыт')).toBeInTheDocument();
    expect(within(preview).getByText('Профи')).toBeInTheDocument();
    expect(mocks.post).not.toHaveBeenCalled();

    await user.click(screen.getByRole('tab', { name: 'Редактор' }));
    await user.click(screen.getByRole('button', { name: 'Создать черновик' }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    const [path, body] = mocks.post.mock.calls[0]!;
    expect(path).toBe('/admin/forms');
    expect(body.slug).toBe('apply');
    expect(body.fields).toMatchObject([
      { type: 'RADIO', label: 'Опыт', order: 0, options: ['Новичок', 'Профи'] },
      { type: 'TEXT', label: 'Ваш ник', order: 1 },
    ]);
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/admin/forms'));
  });

  it('удаление последнего поля заблокировано', async () => {
    mocks.granted.add('forms.create');
    render(<NewFormPage />, { wrapper: Providers });
    expect(await screen.findByRole('button', { name: 'Удалить поле 1' })).toBeDisabled();
  });
});

describe('Конструктор форм: правка', () => {
  it('грузит форму, сохраняет поля вместе со служебными свойствами', async () => {
    const user = userEvent.setup();
    mocks.granted.add('forms.view');
    mocks.granted.add('forms.edit');
    render(<EditFormPage />, { wrapper: Providers });
    const cards = await screen.findAllByTestId('builder-field');
    expect(within(cards[0]!).getByLabelText(/Вопрос/)).toHaveValue('Ник');
    expect(screen.getByLabelText(/Адрес \(slug\)/)).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledTimes(1));
    const [path, body] = mocks.patch.mock.calls[0]!;
    expect(path).toBe('/admin/forms/f1');
    expect(body).not.toHaveProperty('slug');
    expect(body.fields[0]).toMatchObject({ label: 'Ник', minLength: 3, maxLength: 16 });
    expect(body.fields[1]).toMatchObject({ validation: { pattern: 'x' } });
  });

  it('у формы с ответами поля заблокированы и не отправляются', async () => {
    const user = userEvent.setup();
    mocks.granted.add('forms.view');
    mocks.granted.add('forms.edit');
    mocks.get.mockImplementation(async () => ({
      ...structuredClone(SERVER_FORM),
      responsesCount: 7,
    }));
    render(<EditFormPage />, { wrapper: Providers });
    expect(await screen.findByText(/поля менять нельзя/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Добавить поле' })).toBeNull();
    expect(screen.getAllByLabelText(/Вопрос/)[0]).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledTimes(1));
    expect(mocks.patch.mock.calls[0]![1]).not.toHaveProperty('fields');
  });

  it('нужны оба права: view и edit', () => {
    mocks.granted.add('forms.edit');
    render(<EditFormPage />, { wrapper: Providers });
    expect(mocks.get).not.toHaveBeenCalled();
  });
});
