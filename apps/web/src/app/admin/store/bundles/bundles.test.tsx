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
  mocks.get.mockImplementation(async (path: string) => (path === '/store/bundles' ? [BUNDLE] : []));
});

describe('Наборы (1.3): права', () => {
  it('без прав на наборы — экран 403, запросов нет', () => {
    render(<AdminStoreBundlesPage />, { wrapper: Providers });
    expect(screen.getByText(/store\.bundles\.create/)).toBeInTheDocument();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('с одним правом delete: список и «Удалить», без «Изменить» и «Новый набор»', async () => {
    mocks.granted.add('store.bundles.delete');
    render(<AdminStoreBundlesPage />, { wrapper: Providers });
    const grid = await screen.findByTestId('admin-bundles');
    expect(await within(grid).findByText('Стартовый набор')).toBeInTheDocument();
    expect(within(grid).getByRole('button', { name: 'Удалить' })).toBeInTheDocument();
    expect(within(grid).queryByRole('button', { name: 'Изменить' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Новый набор' })).toBeNull();
    expect(screen.getByTestId('bundles-list-note')).toHaveTextContent(/только включённые/);
  });
});

describe('Наборы (1.3): действия', () => {
  it('удаление: ConfirmDialog, до подтверждения DELETE не уходит', async () => {
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

  it('выключение — PATCH только с isActive', async () => {
    mocks.granted.add('store.bundles.edit');
    const user = userEvent.setup();
    render(<AdminStoreBundlesPage />, { wrapper: Providers });
    const grid = await screen.findByTestId('admin-bundles');
    await user.click(await within(grid).findByRole('button', { name: 'Выключить' }));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith('/admin/store/bundles/bn1', { isActive: false }),
    );
  });

  it('создание: пустая форма — ошибки и нет POST; нет состава — ошибка состава', async () => {
    for (const key of ['store.bundles.create']) mocks.granted.add(key);
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
    expect(section.requirement).toEqual([
      'store.bundles.create',
      'store.bundles.edit',
      'store.bundles.delete',
    ]);
    expect(store.requirement).toEqual(expect.arrayContaining(['store.bundles.edit']));
  });
});
