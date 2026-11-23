import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ADMIN_NAV } from '@/lib/admin/navigation';
import {
  bundleDiscountPercent,
  describeBundleError,
  validateBundleItems,
  validateBundlePrice,
  validateBundleSlug,
} from '@/lib/admin/store-bundles';
import { ApiError } from '@/lib/api/errors';
import AdminStoreBundlesPage from './page';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  granted: new Set<string>(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get, post: mocks.post, patch: mocks.patch, delete: mocks.delete },
}));
vi.mock('@/lib/auth/use-permissions', () => ({
  usePermissions: () => ({
    can: (key: string | string[]) =>
      (Array.isArray(key) ? key : [key]).some((k) => mocks.granted.has(k)),
  }),
}));
vi.mock('@/components/ui/toast', () => ({ toast: mocks.toast }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/store/bundles',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const BUNDLE = {
  id: 'bn1',
  name: 'Стартовый набор',
  slug: 'starter',
  description: null,
  image: null,
  totalPrice: '299.00',
  originalPrice: '399.00',
  isActive: true,
  isFeatured: false,
  validFrom: null,
  validUntil: null,
  items: [{ id: 'i1', productId: 'p1', variantId: null, quantity: 2, product: { name: 'Ключ' } }],
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
  for (const fn of [mocks.get, mocks.post, mocks.patch, mocks.delete]) fn.mockReset();
  for (const fn of Object.values(mocks.toast)) fn.mockReset();
  mocks.post.mockResolvedValue(BUNDLE);
  mocks.patch.mockResolvedValue(BUNDLE);
  mocks.delete.mockResolvedValue({ success: true });
  mocks.get.mockImplementation(async (path: string) =>
    path.startsWith('/admin/store/bundles')
      ? { items: [BUNDLE], total: 1, page: 1, limit: 30 }
      : null,
  );
});

describe('Наборы (1.3): права', () => {
  it('без прав на наборы — экран 403, запросов нет', () => {
    render(<AdminStoreBundlesPage />, { wrapper: Providers });
    expect(screen.getByText(/store\.bundles\.view/)).toBeInTheDocument();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('только view: список из админского эндпоинта, без кнопок действий', async () => {
    mocks.granted.add('store.bundles.view');
    render(<AdminStoreBundlesPage />, { wrapper: Providers });
    const grid = await screen.findByTestId('admin-bundles');
    expect(await within(grid).findByText('Стартовый набор')).toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledWith('/admin/store/bundles?page=1&limit=30');
    expect(within(grid).queryByRole('button', { name: 'Удалить' })).toBeNull();
    expect(within(grid).queryByRole('button', { name: 'Изменить' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Новый набор' })).toBeNull();
  });

  it('выключенный набор виден в списке и включается обратно без подтверждения', async () => {
    mocks.granted.add('store.bundles.view');
    mocks.granted.add('store.bundles.edit');
    mocks.get.mockResolvedValue({
      items: [{ ...BUNDLE, isActive: false }],
      total: 1,
      page: 1,
      limit: 30,
    });
    const user = userEvent.setup();
    render(<AdminStoreBundlesPage />, { wrapper: Providers });
    const grid = await screen.findByTestId('admin-bundles');
    expect(await within(grid).findByText('Выключен')).toBeInTheDocument();
    await user.click(within(grid).getByRole('button', { name: 'Включить' }));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith('/admin/store/bundles/bn1', { isActive: true }),
    );
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});

describe('Наборы (1.3): действия', () => {
  it('удаление: ConfirmDialog, до подтверждения DELETE не уходит', async () => {
    mocks.granted.add('store.bundles.view');
    mocks.granted.add('store.bundles.delete');
    const user = userEvent.setup();
    render(<AdminStoreBundlesPage />, { wrapper: Providers });
    const grid = await screen.findByTestId('admin-bundles');
    await user.click(await within(grid).findByRole('button', { name: 'Удалить' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/Удалить набор «Стартовый набор»/)).toBeInTheDocument();
    expect(mocks.delete).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Отмена' }));
    expect(mocks.delete).not.toHaveBeenCalled();
    await user.click(await within(grid).findByRole('button', { name: 'Удалить' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Удалить' }),
    );
    await waitFor(() => expect(mocks.delete).toHaveBeenCalledWith('/admin/store/bundles/bn1'));
  });

  it('выключение: ConfirmDialog, PATCH только с isActive после подтверждения', async () => {
    mocks.granted.add('store.bundles.view');
    mocks.granted.add('store.bundles.edit');
    const user = userEvent.setup();
    render(<AdminStoreBundlesPage />, { wrapper: Providers });
    const grid = await screen.findByTestId('admin-bundles');
    await user.click(await within(grid).findByRole('button', { name: 'Выключить' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/Выключить набор «Стартовый набор»/)).toBeInTheDocument();
    expect(mocks.patch).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Отмена' }));
    expect(mocks.patch).not.toHaveBeenCalled();
    await user.click(await within(grid).findByRole('button', { name: 'Выключить' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Выключить' }),
    );
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith('/admin/store/bundles/bn1', { isActive: false }),
    );
  });

  it.each([
    ['403 без кода', new ApiError(403, ['Forbidden']), /Недостаточно прав/],
    [
      '403 admin_2fa_required',
      new ApiError(403, ['Forbidden'], { code: 'admin_2fa_required' }),
      /двухфакторная/,
    ],
    ['5xx', new ApiError(500, ['boom']), /отключите его вместо удаления/],
  ])('удаление, ошибка %s: тост с понятным текстом, диалог закрыт', async (_n, error, text) => {
    mocks.granted.add('store.bundles.view');
    mocks.granted.add('store.bundles.delete');
    mocks.delete.mockRejectedValue(error);
    const user = userEvent.setup();
    render(<AdminStoreBundlesPage />, { wrapper: Providers });
    const grid = await screen.findByTestId('admin-bundles');
    await user.click(await within(grid).findByRole('button', { name: 'Удалить' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Удалить' }),
    );
    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith(expect.stringMatching(text)),
    );
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('ошибка 5xx при загрузке списка — состояние ошибки, не пустой список', async () => {
    mocks.granted.add('store.bundles.view');
    mocks.get.mockRejectedValue(new ApiError(500, ['boom']));
    render(<AdminStoreBundlesPage />, { wrapper: Providers });
    const grid = await screen.findByTestId('admin-bundles');
    await waitFor(() => expect(within(grid).queryByText('Стартовый набор')).toBeNull());
    expect(within(grid).queryByText('Наборов пока нет')).toBeNull();
  });

  it('создание: пустая форма — ошибки и нет POST; нет состава — ошибка состава', async () => {
    for (const key of ['store.bundles.view', 'store.bundles.create']) mocks.granted.add(key);
    const user = userEvent.setup();
    render(<AdminStoreBundlesPage />, { wrapper: Providers });
    await user.click(await screen.findByRole('button', { name: 'Новый набор' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Название/), 'Тест');
    await user.type(within(dialog).getByLabelText(/Slug/), 'Bad Slug');
    await user.type(within(dialog).getByLabelText(/Цена набора/), '10.999');
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    expect(
      within(dialog).getByText('Только строчные латинские буквы, цифры и дефис'),
    ).toBeVisible();
    expect(within(dialog).getByText(/не более чем с 2 знаками/)).toBeVisible();
    expect(within(dialog).getByText('Добавьте хотя бы один товар')).toBeVisible();
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('правка названия — PATCH только с name', async () => {
    mocks.granted.add('store.bundles.view');
    mocks.granted.add('store.bundles.edit');
    const user = userEvent.setup();
    render(<AdminStoreBundlesPage />, { wrapper: Providers });
    const grid = await screen.findByTestId('admin-bundles');
    await user.click(await within(grid).findByRole('button', { name: 'Изменить' }));
    const dialog = await screen.findByRole('dialog');
    const name = within(dialog).getByLabelText(/Название/);
    await user.clear(name);
    await user.type(name, 'Новый набор 2');
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith('/admin/store/bundles/bn1', {
        name: 'Новый набор 2',
      }),
    );
  });
});

describe('Наборы (1.3): валидация и ошибки', () => {
  it('slug, цена, состав', () => {
    expect(validateBundleSlug('starter-1')).toBeNull();
    expect(validateBundleSlug('Starter')).not.toBeNull();
    expect(validateBundleSlug('')).not.toBeNull();
    expect(validateBundlePrice('0')).toBeNull();
    expect(validateBundlePrice('12.345')).not.toBeNull();
    expect(validateBundlePrice('-1')).not.toBeNull();
    expect(validateBundleItems([])).toBe('Добавьте хотя бы один товар');
    const item = { productId: 'p', variantId: '', quantity: '1' };
    expect(validateBundleItems([item])).toBeNull();
    expect(validateBundleItems([item, item])).toMatch(/дважды/);
    expect(validateBundleItems([item, { ...item, quantity: '5' }])).toMatch(/дважды/);
    expect(validateBundleItems([item, { ...item, variantId: 'v1' }])).toBeNull();
    expect(validateBundleItems([{ ...item, quantity: '0' }])).toMatch(/Количество/);
    expect(bundleDiscountPercent('75.00', '100.00')).toBe(25);
    expect(bundleDiscountPercent('150.00', '100.00')).toBeNull();
  });

  it('коды и статусы API превращаются в русские тексты', () => {
    expect(describeBundleError(new ApiError(409, ['Set already exists'])).fields.slug).toMatch(
      /уже существует/,
    );
    expect(describeBundleError(new ApiError(404, ['Not Found'])).message).toMatch(
      /Набор не найден/,
    );
    const validation = describeBundleError(
      new ApiError(400, ['totalPrice must not be less than 0']),
    );
    expect(validation.fields.totalPrice).toMatch(/цену набора/);
    expect(describeBundleError(new ApiError(500, ['x'])).message).toMatch(/отключите/);
    const twoFa = describeBundleError(
      new ApiError(403, ['Forbidden'], { code: 'admin_2fa_required' }),
    );
    expect(twoFa.needsTwoFactor).toBe(true);
    expect(describeBundleError(new ApiError(403, ['Forbidden'])).forbidden).toBe(true);
  });
});

describe('Навигация магазина (1.3): наборы', () => {
  it('«Наборы» — подраздел с любым из прав набора', () => {
    const store = ADMIN_NAV.find((group) => group.id === 'store')!.items[0]!;
    const section = store.sections!.find((s) => s.href === '/admin/store/bundles')!;
    expect(section.requirement).toBe('store.bundles.view');
    expect(store.requirement).toEqual(expect.arrayContaining(['store.bundles.edit']));
  });
});
