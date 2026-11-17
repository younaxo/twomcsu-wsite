import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ADMIN_NAV } from '@/lib/admin/navigation';
import AdminStoreDiscountsPage from './page';

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
  usePathname: () => '/admin/store/discounts',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const BULK = {
  id: 'b1',
  productId: null,
  productType: null,
  minQuantity: 5,
  minAmount: null,
  discountType: 'PERCENT',
  discountValue: '10.00',
  isActive: true,
  createdAt: '2026-11-01T00:00:00.000Z',
};
const LOYALTY = {
  id: 'l1',
  minPurchases: 3,
  discountPercent: '5.00',
  name: 'Постоянный игрок',
  description: null,
  isActive: false,
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
  mocks.post.mockResolvedValue(LOYALTY);
  mocks.patch.mockResolvedValue(LOYALTY);
  mocks.get.mockImplementation(async (path: string) => {
    if (path === '/admin/store/discounts/bulk') return [BULK];
    if (path === '/admin/store/discounts/loyalty') return [LOYALTY];
    return [];
  });
});

describe('Скидки (0.4)', () => {
  it('без store.discounts.view — экран 403, запросов нет', () => {
    render(<AdminStoreDiscountsPage />, { wrapper: Providers });
    expect(screen.getByText(/store\.discounts\.view/)).toBeInTheDocument();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('просмотр: вкладка объёма, затем лояльности; кнопок изменения нет', async () => {
    mocks.granted.add('store.discounts.view');
    const user = userEvent.setup();
    render(<AdminStoreDiscountsPage />, { wrapper: Providers });
    const bulk = await screen.findByTestId('admin-bulk-discounts');
    expect(await within(bulk).findByText('10 % (Процент)')).toBeInTheDocument();
    expect(within(bulk).getByText('от 5 шт.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Новая скидка/ })).toBeNull();
    await user.click(screen.getByRole('tab', { name: 'За лояльность' }));
    const loyalty = await screen.findByTestId('admin-loyalty-discounts');
    expect(await within(loyalty).findByText('Постоянный игрок')).toBeInTheDocument();
    expect(within(loyalty).getByText('Отключена')).toBeInTheDocument();
  });

  it('лояльность: процент больше 100 — ошибка, запроса нет; верный — POST строкой', async () => {
    for (const key of ['store.discounts.view', 'store.discounts.loyalty.create']) {
      mocks.granted.add(key);
    }
    const user = userEvent.setup();
    render(<AdminStoreDiscountsPage />, { wrapper: Providers });
    await user.click(await screen.findByRole('tab', { name: 'За лояльность' }));
    await user.click(await screen.findByRole('button', { name: 'Новая скидка за лояльность' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Название/), 'Ветеран');
    await user.type(within(dialog).getByLabelText(/От числа покупок/), '10');
    await user.type(within(dialog).getByLabelText(/Скидка, %/), '120');
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    expect(within(dialog).getByText('Процент не может быть больше 100')).toBeVisible();
    expect(mocks.post).not.toHaveBeenCalled();

    const percent = within(dialog).getByLabelText(/Скидка, %/);
    await user.clear(percent);
    await user.type(percent, '7.50');
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    const [path, body] = mocks.post.mock.calls[0]!;
    expect(path).toBe('/admin/store/discounts/loyalty');
    expect(body).toEqual({ name: 'Ветеран', minPurchases: 10, discountPercent: '7.50' });
  });
});

describe('Навигация магазина (0.4)', () => {
  it('заказы, промокоды и скидки — подразделы одного пункта, без роста числа пунктов', () => {
    const store = ADMIN_NAV.find((group) => group.id === 'store')!.items;
    expect(store).toHaveLength(1);
    const hrefs = store[0]!.sections!.map((s) => s.href);
    expect(hrefs).toEqual(
      expect.arrayContaining([
        '/admin/store/orders',
        '/admin/store/promocodes',
        '/admin/store/discounts',
      ]),
    );
    expect(store[0]!.requirement).toContain('store.discounts.view');
  });
});
