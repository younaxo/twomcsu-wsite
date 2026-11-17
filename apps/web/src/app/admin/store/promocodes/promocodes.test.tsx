import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ApiError } from '@/lib/api/errors';
import {
  describeDiscountAdminError,
  validateDiscountValue,
  validateOptionalMoney,
} from '@/lib/admin/store-discounts';
import AdminStorePromocodesPage from './page';

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
  usePathname: () => '/admin/store/promocodes',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const PROMO = {
  id: 'pr1',
  code: 'SPRING',
  description: null,
  discountType: 'PERCENT',
  discountValue: '15.00',
  maxUses: 100,
  usedCount: 3,
  validFrom: null,
  validUntil: null,
  isActive: true,
  applicableToTypes: [],
  minOrderAmount: null,
  firstPurchaseOnly: false,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
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
  mocks.post.mockResolvedValue(PROMO);
  mocks.patch.mockResolvedValue(PROMO);
  mocks.delete.mockResolvedValue({ success: true });
  mocks.get.mockResolvedValue([PROMO]);
});

describe('Промокоды и скидки: валидаторы', () => {
  it('процент 0–100, Decimal-строки без float', () => {
    expect(validateDiscountValue('PERCENT', '100')).toBeNull();
    expect(validateDiscountValue('PERCENT', '100.01')).toMatch(/больше 100/);
    expect(validateDiscountValue('PERCENT', '0')).toMatch(/больше 0/);
    expect(validateDiscountValue('PERCENT', '12.345')).toBeTruthy();
    expect(validateDiscountValue('FIXED', '250.50')).toBeNull();
    expect(validateDiscountValue('FIXED', '')).toBe('Введите значение');
    expect(validateOptionalMoney('')).toBeNull();
    expect(validateOptionalMoney('1.234')).toBeTruthy();
  });

  it('PROMO_HAS_ORDERS — понятное сообщение; поля из 400', () => {
    const del = describeDiscountAdminError(new ApiError(409, ['x'], { code: 'PROMO_HAS_ORDERS' }));
    expect(del.message).toMatch(/Отключите промокод/);
    const bad = describeDiscountAdminError(new ApiError(400, ['discountValue must be positive']));
    expect(bad.fields.discountValue).toBeTruthy();
  });
});

describe('Промокоды (0.4)', () => {
  it('без права — экран 403, запросов нет', () => {
    render(<AdminStorePromocodesPage />, { wrapper: Providers });
    expect(screen.getByText(/promocodes\.view/)).toBeInTheDocument();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('только просмотр: список без кнопок изменения', async () => {
    mocks.granted.add('promocodes.view');
    render(<AdminStorePromocodesPage />, { wrapper: Providers });
    const list = await screen.findByTestId('admin-promocodes');
    expect(await within(list).findByText('SPRING')).toBeInTheDocument();
    expect(within(list).getByText('3 из 100')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Новый промокод' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Удалить' })).toBeNull();
  });

  it('создание: невалидный процент и код — ошибки у полей, запроса нет', async () => {
    for (const key of ['promocodes.view', 'promocodes.create']) mocks.granted.add(key);
    const user = userEvent.setup();
    render(<AdminStorePromocodesPage />, { wrapper: Providers });
    await screen.findByText('SPRING');
    await user.click(screen.getByRole('button', { name: 'Новый промокод' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Код/), 'ab');
    await user.type(within(dialog).getByLabelText(/Размер скидки/), '101');
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    expect(within(dialog).getByText('От 3 до 32 символов')).toBeVisible();
    expect(within(dialog).getByText('Процент не может быть больше 100')).toBeVisible();
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('создание: POST с кодом и значением строкой', async () => {
    for (const key of ['promocodes.view', 'promocodes.create']) mocks.granted.add(key);
    const user = userEvent.setup();
    render(<AdminStorePromocodesPage />, { wrapper: Providers });
    await screen.findByText('SPRING');
    await user.click(screen.getByRole('button', { name: 'Новый промокод' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Код/), 'summer-10');
    await user.type(within(dialog).getByLabelText(/Размер скидки/), '10.50');
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    const [path, body] = mocks.post.mock.calls[0]!;
    expect(path).toBe('/admin/promocodes');
    expect(body).toMatchObject({
      code: 'SUMMER-10',
      discountType: 'PERCENT',
      discountValue: '10.50',
    });
    expect(typeof body.discountValue).toBe('string');
  });

  it('удаление: 409 PROMO_HAS_ORDERS — понятная ошибка', async () => {
    for (const key of ['promocodes.view', 'promocodes.delete']) mocks.granted.add(key);
    mocks.delete.mockRejectedValueOnce(new ApiError(409, ['x'], { code: 'PROMO_HAS_ORDERS' }));
    const user = userEvent.setup();
    render(<AdminStorePromocodesPage />, { wrapper: Providers });
    await screen.findByText('SPRING');
    await user.click(screen.getByRole('button', { name: 'Удалить' }));
    const confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: 'Удалить' }));
    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith(expect.stringMatching(/Отключите промокод/)),
    );
  });
});
