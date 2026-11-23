import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ApiError } from '@/lib/api/errors';
import {
  describeTemplateError,
  parseRootsInput,
  validateRootsClient,
  validateTemplateClient,
  validateTwoFactorCode,
} from '@/lib/admin/store-delivery-templates';
import type { AdminProduct } from '@/lib/admin/store-products';
import { ProductDialog } from './_components/product-dialog';
import CommandRootsPage from '../command-roots/page';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  granted: new Set<string>(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get, post: mocks.post, put: mocks.put },
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
  usePathname: () => '/admin/store/products',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const PRODUCT: AdminProduct = {
  id: 'p1',
  name: 'VIP',
  slug: 'vip',
  description: null,
  fullDescription: null,
  type: 'PRIVILEGE',
  image: null,
  images: [],
  categoryId: 'c1',
  category: { id: 'c1', name: 'Привилегии', slug: 'privileges' },
  isGiftable: true,
  isSelfOnly: false,
  isUnique: false,
  isSeasonalOnly: false,
  isFeatured: false,
  maxPerPurchase: null,
  currencyType: null,
  currencyAmount: null,
  server: null,
  isActive: false,
  order: 0,
  variants: [
    { id: 'v1', duration: 'FOREVER', price: '499.00', oldPrice: null, isActive: true, order: 0 },
  ],
} as AdminProduct;

const ROOTS = {
  defaults: ['lp', 'luckperms', 'give'],
  forbidden: ['op', 'stop'],
  extra: ['mycmd'],
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
  for (const fn of [mocks.get, mocks.post, mocks.put]) fn.mockReset();
  for (const fn of Object.values(mocks.toast)) fn.mockReset();
  mocks.get.mockImplementation(async (path: string) => {
    if (path.endsWith('/roots')) return ROOTS;
    if (path === '/admin/store/delivery-templates') return [];
    return [];
  });
});

async function openEdit() {
  const user = userEvent.setup();
  render(
    <ProductDialog
      product={PRODUCT}
      categories={[{ id: 'c1', name: 'Привилегии', slug: 'privileges' }]}
      permissions={{ canCreate: true, canEdit: true, canVariants: true }}
      open
      onOpenChange={() => {}}
    />,
    { wrapper: Providers },
  );
  const dialog = await screen.findByRole('dialog');
  return { user, dialog };
}

describe('клиентская проверка шаблона', () => {
  const allowed = ['lp', 'give'];
  const forbidden = ['op'];
  it('принимает корректный шаблон', () => {
    expect(
      validateTemplateClient('lp user {username} parent add vip', allowed, forbidden),
    ).toBeNull();
  });
  it.each([
    ['', /пустым/],
    ['/lp user {username}', /«\/»/],
    ['op {username}', /запрещена/],
    ['kill {username}', /белом списке/],
    ['lp user {nick}', /Неизвестная переменная/],
    ['lp user x; stop', /недопустимые символы/],
    ['lp user ok', /\{username\}/],
    ['lp {username}\n{username}', /управляющие|переводы/],
  ])('отклоняет %j', (value, pattern) => {
    expect(validateTemplateClient(value, allowed, forbidden)).toMatch(pattern);
  });
  it('корни и 2FA', () => {
    expect(parseRootsInput('A, b  c,b')).toEqual(['a', 'b', 'c']);
    expect(validateRootsClient(['op'], ['op'])).toMatch(/запрещён/);
    expect(validateRootsClient(['Bad!'], [])).toMatch(/латиница/);
    expect(validateTwoFactorCode('12')).toMatch(/6 до 8/);
    expect(validateTwoFactorCode('123456')).toBeNull();
  });
  it('машинные коды -> русские тексты, 429 -> «Слишком много попыток»', () => {
    expect(
      describeTemplateError(new ApiError(400, ['x'], { code: 'root_forbidden' })).message,
    ).toMatch(/запрещено/);
    expect(
      describeTemplateError(new ApiError(403, ['x'], { code: 'two_factor_invalid' })).message,
    ).toBe('Неверный код 2FA. Введите актуальный код из приложения.');
    const limited = describeTemplateError(
      new ApiError(429, ['Too Many'], { code: 'template_two_factor_locked' }),
    );
    expect(limited.message).toMatch(/Слишком много попыток/);
    expect(limited.rateLimited).toBe(true);
  });
});

describe('блок «Команда выдачи» в карточке товара', () => {
  it('без права store.delivery.templates.manage блока нет, запросов нет', async () => {
    const { dialog } = await openEdit();
    expect(within(dialog).queryByTestId('delivery-template-block')).toBeNull();
    expect(within(dialog).getByTestId('delivery-note')).toBeVisible();
    expect(mocks.get).not.toHaveBeenCalledWith(
      '/admin/store/delivery-templates',
      expect.anything(),
    );
  });

  it('с правом: подсказка переменных и корней, поле 2FA с one-time-code', async () => {
    mocks.granted.add('store.delivery.templates.manage');
    const { dialog } = await openEdit();
    const block = await within(dialog).findByTestId('delivery-template-block');
    expect(within(dialog).getByRole('group', { name: 'Команда выдачи' })).toBeVisible();
    expect(block).toHaveTextContent('{username}');
    expect(block).toHaveTextContent('{duration}');
    await waitFor(() =>
      expect(within(block).getByTestId('template-roots')).toHaveTextContent(
        'lp, luckperms, give, mycmd',
      ),
    );
    expect(within(block).getByLabelText(/Код 2FA/)).toHaveAttribute(
      'autocomplete',
      'one-time-code',
    );
  });

  it('предпросмотр: POST preview с тестовым ником, итог текстом, без сохранения', async () => {
    mocks.granted.add('store.delivery.templates.manage');
    mocks.post.mockResolvedValue({ command: 'lp user TestPlayer parent add vip' });
    const { user, dialog } = await openEdit();
    const block = await within(dialog).findByTestId('delivery-template-block');
    await user.type(
      within(block).getByLabelText(/Шаблон команды/),
      'lp user {{username} parent add vip',
    );
    await user.click(within(block).getByRole('button', { name: 'Предпросмотр' }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    expect(mocks.post).toHaveBeenCalledWith('/admin/store/delivery-templates/preview', {
      template: 'lp user {username} parent add vip',
      username: 'TestPlayer',
      duration: 'FOREVER',
    });
    expect(await within(block).findByTestId('template-preview-result')).toHaveTextContent(
      'lp user TestPlayer parent add vip',
    );
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it('невалидный шаблон: ошибка у поля, запрос не уходит', async () => {
    mocks.granted.add('store.delivery.templates.manage');
    const { user, dialog } = await openEdit();
    const block = await within(dialog).findByTestId('delivery-template-block');
    await user.type(within(block).getByLabelText(/Шаблон команды/), 'op {{username}');
    await user.click(within(block).getByRole('button', { name: 'Предпросмотр' }));
    expect(within(block).getByText(/Команда «op» запрещена/)).toBeVisible();
    expect(within(block).getByLabelText(/Шаблон команды/)).toHaveAttribute('aria-invalid', 'true');
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('сохранение: PUT с кодом 2FA; поле кода очищается после успеха', async () => {
    mocks.granted.add('store.delivery.templates.manage');
    mocks.put.mockResolvedValue({ id: 't1', version: 1 });
    const { user, dialog } = await openEdit();
    const block = await within(dialog).findByTestId('delivery-template-block');
    await user.type(within(block).getByLabelText(/Шаблон команды/), 'give {{username} diamond 1');
    await user.type(within(block).getByLabelText(/Код 2FA/), '123456');
    await user.click(within(block).getByRole('button', { name: 'Сохранить шаблон' }));
    await waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(1));
    expect(mocks.put).toHaveBeenCalledWith('/admin/store/delivery-templates/products/p1', {
      template: 'give {username} diamond 1',
      twoFactorCode: '123456',
      variantId: undefined,
    });
    await waitFor(() => expect(within(block).getByLabelText(/Код 2FA/)).toHaveValue(''));
  });

  it('без кода 2FA запрос не уходит', async () => {
    mocks.granted.add('store.delivery.templates.manage');
    const { user, dialog } = await openEdit();
    const block = await within(dialog).findByTestId('delivery-template-block');
    await user.type(within(block).getByLabelText(/Шаблон команды/), 'give {{username} diamond 1');
    await user.click(within(block).getByRole('button', { name: 'Сохранить шаблон' }));
    expect(within(block).getByText(/Введите код 2FA/)).toBeVisible();
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it('неверный код: сообщение role=alert, поле очищено; 429 — «Слишком много попыток»', async () => {
    mocks.granted.add('store.delivery.templates.manage');
    mocks.put.mockRejectedValueOnce(new ApiError(403, ['x'], { code: 'two_factor_invalid' }));
    mocks.put.mockRejectedValueOnce(
      new ApiError(429, ['x'], { code: 'template_two_factor_locked' }),
    );
    const { user, dialog } = await openEdit();
    const block = await within(dialog).findByTestId('delivery-template-block');
    await user.type(within(block).getByLabelText(/Шаблон команды/), 'give {{username} diamond 1');
    const code = within(block).getByLabelText(/Код 2FA/);
    await user.type(code, '111111');
    await user.click(within(block).getByRole('button', { name: 'Сохранить шаблон' }));
    const alert = await within(block).findByRole('alert');
    expect(alert).toHaveTextContent('Неверный код 2FA');
    await waitFor(() => expect(code).toHaveValue(''));
    expect(code).toHaveFocus();

    await user.type(code, '222222');
    await user.click(within(block).getByRole('button', { name: 'Сохранить шаблон' }));
    await waitFor(() =>
      expect(within(block).getByRole('alert')).toHaveTextContent('Слишком много попыток'),
    );
    expect(code).toHaveValue('');
  });

  it('серверный код root_not_allowed показывается по-русски', async () => {
    mocks.granted.add('store.delivery.templates.manage');
    mocks.put.mockRejectedValue(
      new ApiError(400, ['root_not_allowed'], { code: 'root_not_allowed' }),
    );
    const { user, dialog } = await openEdit();
    const block = await within(dialog).findByTestId('delivery-template-block');
    await user.type(within(block).getByLabelText(/Шаблон команды/), 'lp {{username}');
    await user.type(within(block).getByLabelText(/Код 2FA/), '123456');
    await user.click(within(block).getByRole('button', { name: 'Сохранить шаблон' }));
    expect(await within(block).findByRole('alert')).toHaveTextContent(
      'Первое слово команды не входит в разрешённые корни.',
    );
  });

  it('сохранённый шаблон подставляется в поле; HTML в нём остаётся текстом', async () => {
    mocks.granted.add('store.delivery.templates.manage');
    mocks.get.mockImplementation(async (path: string) => {
      if (path.endsWith('/roots')) return ROOTS;
      return [
        {
          id: 't1',
          productId: 'p1',
          variantId: null,
          scopeKey: 'p1:*',
          template: 'lp user {username} <b>x</b>',
          version: 3,
        },
      ];
    });
    const { dialog } = await openEdit();
    const block = await within(dialog).findByTestId('delivery-template-block');
    await waitFor(() =>
      expect(within(block).getByLabelText(/Шаблон команды/)).toHaveValue(
        'lp user {username} <b>x</b>',
      ),
    );
    expect(within(block).getByTestId('template-saved-state')).toHaveTextContent('версия 3');
    expect(block.querySelector('b')).toBeNull();
  });
});

describe('страница «Корни команд»', () => {
  it('без права — 403, запросов нет', () => {
    render(<CommandRootsPage />, { wrapper: Providers });
    expect(screen.getByText(/store\.delivery\.templates\.manage/)).toBeInTheDocument();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('показывает списки; сохранение с 2FA; запрещённый корень отсекается на клиенте', async () => {
    mocks.granted.add('store.delivery.templates.manage');
    mocks.put.mockResolvedValue({ extra: ['mycmd', 'kit'] });
    const user = userEvent.setup();
    render(<CommandRootsPage />, { wrapper: Providers });
    expect(await screen.findByText('Запрещены всегда')).toBeVisible();
    expect(screen.getByText('luckperms')).toBeVisible();
    const roots = screen.getByLabelText('Дополнительные корни');
    expect(roots).toHaveValue('mycmd');
    await user.clear(roots);
    await user.type(roots, 'mycmd, op');
    await user.type(screen.getByLabelText(/Код 2FA/), '123456');
    await user.click(screen.getByRole('button', { name: 'Сохранить список' }));
    expect(screen.getByText(/Корень «op» запрещён/)).toBeVisible();
    expect(mocks.put).not.toHaveBeenCalled();

    await user.clear(roots);
    await user.type(roots, 'mycmd, kit');
    await user.click(screen.getByRole('button', { name: 'Сохранить список' }));
    await waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(1));
    expect(mocks.put).toHaveBeenCalledWith('/admin/store/delivery-templates/roots', {
      roots: ['mycmd', 'kit'],
      twoFactorCode: '123456',
    });
    expect(screen.getByLabelText(/Код 2FA/)).toHaveAttribute('autocomplete', 'one-time-code');
  });
});
