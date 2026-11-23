import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ADMIN_NAV } from '@/lib/admin/navigation';
import {
  describeCurrencyError,
  validateCurrencyCode,
  validateCurrencyRate,
} from '@/lib/admin/store-currencies';
import { ApiError } from '@/lib/api/errors';
import AdminStoreCurrenciesPage from './page';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  granted: new Set<string>(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get, post: mocks.post, patch: mocks.patch },
}));
vi.mock('@/lib/auth/use-permissions', () => ({
  usePermissions: () => ({
    can: (key: string | string[]) =>
      (Array.isArray(key) ? key : [key]).some((k) => mocks.granted.has(k)),
  }),
}));
vi.mock('@/components/ui/toast', () => ({ toast: mocks.toast }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/store/currencies',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const RATE = {
  id: 'c1',
  currency: 'RUBY',
  rate: '2.5000',
  symbol: 'R',
  flag: 'RB',
  isActive: true,
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
  for (const fn of [mocks.get, mocks.post, mocks.patch]) fn.mockReset();
  for (const fn of Object.values(mocks.toast)) fn.mockReset();
  mocks.post.mockResolvedValue(RATE);
  mocks.patch.mockResolvedValue(RATE);
  mocks.get.mockResolvedValue([RATE]);
});

describe('Валюты (1.3)', () => {
  it('без store.currencies.view — экран 403, запросов нет', () => {
    render(<AdminStoreCurrenciesPage />, { wrapper: Providers });
    expect(screen.getByText(/store\.currencies\.view/)).toBeInTheDocument();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('просмотр: пояснение про рубли, кнопок изменения нет', async () => {
    mocks.granted.add('store.currencies.view');
    render(<AdminStoreCurrenciesPage />, { wrapper: Providers });
    const grid = await screen.findByTestId('admin-currencies');
    expect(await within(grid).findByText('RUBY')).toBeInTheDocument();
    expect(screen.getByTestId('currencies-note')).toHaveTextContent(
      /Оплата заказов всегда в рублях/,
    );
    expect(screen.queryByRole('button', { name: 'Новая валюта' })).toBeNull();
    expect(within(grid).queryByRole('button', { name: 'Изменить' })).toBeNull();
  });

  it('создание: курс 0 — ошибка, верный — POST числом', async () => {
    for (const key of ['store.currencies.view', 'store.currencies.create']) mocks.granted.add(key);
    const user = userEvent.setup();
    render(<AdminStoreCurrenciesPage />, { wrapper: Providers });
    await user.click(await screen.findByRole('button', { name: 'Новая валюта' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Код валюты/), 'COIN');
    await user.type(within(dialog).getByLabelText(/Курс/), '0');
    await user.type(within(dialog).getByLabelText(/Символ/), 'C');
    await user.type(within(dialog).getByLabelText(/Флаг или значок/), 'CN');
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    expect(within(dialog).getByText('Курс должен быть больше 0')).toBeVisible();
    expect(mocks.post).not.toHaveBeenCalled();
    const rate = within(dialog).getByLabelText(/Курс/);
    await user.clear(rate);
    await user.type(rate, '1.25');
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    expect(mocks.post).toHaveBeenCalledWith('/admin/store/currencies', {
      currency: 'COIN',
      rate: 1.25,
      symbol: 'C',
      flag: 'CN',
    });
  });

  it('отключение — PATCH только с isActive по коду валюты', async () => {
    for (const key of ['store.currencies.view', 'store.currencies.edit']) mocks.granted.add(key);
    const user = userEvent.setup();
    render(<AdminStoreCurrenciesPage />, { wrapper: Providers });
    const grid = await screen.findByTestId('admin-currencies');
    await user.click(await within(grid).findByRole('button', { name: 'Отключить' }));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith('/admin/store/currencies/RUBY', {
        isActive: false,
      }),
    );
  });

  it('валидация и ошибки API по-русски', () => {
    expect(validateCurrencyCode('')).not.toBeNull();
    expect(validateCurrencyCode('A B')).not.toBeNull();
    expect(validateCurrencyCode('RUBY')).toBeNull();
    expect(validateCurrencyRate('1.23456')).not.toBeNull();
    expect(validateCurrencyRate('0')).toBe('Курс должен быть больше 0');
    expect(validateCurrencyRate('1.2345')).toBeNull();
    expect(describeCurrencyError(new ApiError(409, ['Conflict'])).fields.currency).toMatch(
      /уже существует/,
    );
    expect(describeCurrencyError(new ApiError(404, ['Not Found'])).message).toMatch(/не найден/);
    expect(describeCurrencyError(new ApiError(400, ['rate must be a number'])).fields.rate).toMatch(
      /курс/,
    );
    expect(describeCurrencyError(new ApiError(403, ['Forbidden'])).forbidden).toBe(true);
  });

  it('навигация: «Валюты» требует store.currencies.view', () => {
    const store = ADMIN_NAV.find((group) => group.id === 'store')!.items[0]!;
    const section = store.sections!.find((s) => s.href === '/admin/store/currencies')!;
    expect(section.requirement).toBe('store.currencies.view');
    expect(store.requirement).toContain('store.currencies.view');
  });
});
