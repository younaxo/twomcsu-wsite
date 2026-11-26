import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import { useAuthStore } from '@/lib/auth/store';
import CheckoutPage from './page';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), push: vi.fn() }));

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get, post: mocks.post },
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: vi.fn() }),
  usePathname: () => '/shop/checkout',
}));
vi.mock('@/lib/site/status', () => ({
  useModuleAvailability: () => ({ reason: null, bypass: false, maintenance: null }),
}));

const CART = {
  id: 'cart1',
  items: [
    {
      id: 'i1',
      quantity: 1,
      productId: 'p1',
      variantId: 'v1',
      product: { id: 'p1', name: 'Товар' },
    },
  ],
  promoCode: null,
  lines: [{ name: 'Товар', quantity: 1, lineTotal: '100.00' }],
  subtotal: '100.00',
  bulkDiscountTotal: '0',
  loyaltyDiscountTotal: '0',
  promoDiscountTotal: '0',
  total: '100.00',
};
const CONFIG = { offerVersion: '3', paymentAvailable: true, quickBuyEnabled: true };
const SBP = { code: 'SBP', title: 'СБП', currency: 'RUB' };
const CARD = { code: 'CARD_RU', title: 'Карта РФ', currency: 'RUB' };
const CRYPTO = { code: 'CRYPTO', title: 'Крипто', currency: 'USDT' };

function route(methods: () => unknown) {
  mocks.get.mockImplementation((path: string) => {
    if (path === '/store/cart') return Promise.resolve(CART);
    if (path === '/store/checkout-config') return Promise.resolve(CONFIG);
    if (path === '/store/payment-methods') return methods();
    if (path.startsWith('/users/')) return Promise.resolve({ id: 'u1', username: 'steve' });
    return Promise.reject(new Error(`unexpected ${path}`));
  });
}

function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
}

const methodCalls = () => mocks.get.mock.calls.filter(([p]) => p === '/store/payment-methods');

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  useAuthStore.setState({
    status: 'authenticated',
    user: { id: 'u1', username: 'steve' },
  } as never);
});

describe('оформление: выбор способа оплаты', () => {
  it('рисует радиогруппу с названием, валютой и без чужих логотипов', async () => {
    route(() => Promise.resolve({ methods: [SBP, CARD] }));
    render(<CheckoutPage />, { wrapper: Providers });
    const group = await screen.findByRole('radiogroup', { name: /Способ оплаты/ });
    expect(group).toHaveAttribute('aria-required', 'true');
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(screen.getByRole('radio', { name: /СБП/ })).toBeInTheDocument();
    expect(screen.getAllByText(/Валюта: ₽, рубли/)).toHaveLength(2);
    expect(document.querySelector('img')).toBeNull();
  });

  it('выбор обязателен: без него заказ не создаётся, ошибка связана с группой', async () => {
    const user = userEvent.setup();
    route(() => Promise.resolve({ methods: [SBP, CARD] }));
    render(<CheckoutPage />, { wrapper: Providers });
    await screen.findByRole('radiogroup');
    await user.click(screen.getByTestId('checkout-offer'));
    await user.click(screen.getByTestId('checkout-submit'));
    const error = await screen.findByTestId('checkout-payment-methods-validation');
    expect(error).toHaveTextContent('Выберите способ оплаты');
    expect(screen.getByRole('radiogroup')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('radiogroup').getAttribute('aria-describedby')).toBe(error.id);
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('отправляет выбранный код способа', async () => {
    const user = userEvent.setup();
    route(() => Promise.resolve({ methods: [SBP, CARD] }));
    mocks.post.mockResolvedValue({ order: { orderNumber: 'TW-9' }, paymentUrl: null });
    render(<CheckoutPage />, { wrapper: Providers });
    await user.click(await screen.findByRole('radio', { name: /Карта РФ/ }));
    await user.click(screen.getByTestId('checkout-offer'));
    await user.click(screen.getByTestId('checkout-submit'));
    await waitFor(() => expect(mocks.post).toHaveBeenCalled());
    expect(mocks.post.mock.calls[0][1]).toMatchObject({ paymentMethod: 'CARD_RU' });
  });

  it('единственный способ выбран сам', async () => {
    const user = userEvent.setup();
    route(() => Promise.resolve({ methods: [SBP] }));
    mocks.post.mockResolvedValue({ order: { orderNumber: 'TW-9' }, paymentUrl: null });
    render(<CheckoutPage />, { wrapper: Providers });
    expect(await screen.findByRole('radio', { name: /СБП/ })).toBeChecked();
    await user.click(screen.getByTestId('checkout-offer'));
    await user.click(screen.getByTestId('checkout-submit'));
    await waitFor(() =>
      expect(mocks.post.mock.calls[0][1]).toMatchObject({ paymentMethod: 'SBP' }),
    );
  });

  it('пустой список: выбора нет, прежний путь без paymentMethod', async () => {
    const user = userEvent.setup();
    route(() => Promise.resolve({ methods: [] }));
    mocks.post.mockResolvedValue({ order: { orderNumber: 'TW-9' }, paymentUrl: null });
    render(<CheckoutPage />, { wrapper: Providers });
    await screen.findByTestId('checkout-submit');
    await waitFor(() => expect(methodCalls().length).toBe(1));
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('checkout-offer'));
    await user.click(screen.getByTestId('checkout-submit'));
    await waitFor(() => expect(mocks.post).toHaveBeenCalled());
    expect(mocks.post.mock.calls[0][1]).not.toHaveProperty('paymentMethod');
  });

  it('старый API (404 списка): прежний путь', async () => {
    route(() => Promise.reject(new ApiError(404, ['Not Found'])));
    render(<CheckoutPage />, { wrapper: Providers });
    const submit = await screen.findByTestId('checkout-submit');
    await waitFor(() => expect(submit).toBeEnabled());
    expect(screen.queryByTestId('checkout-payment-methods-error')).not.toBeInTheDocument();
  });

  it('список не загрузился: безопасная ошибка, оплата заблокирована, повтор работает', async () => {
    const user = userEvent.setup();
    let fail = true;
    route(() =>
      fail
        ? Promise.reject(new ApiError(500, ['internal stack trace']))
        : Promise.resolve({ methods: [SBP, CARD] }),
    );
    render(<CheckoutPage />, { wrapper: Providers });
    const box = await screen.findByTestId('checkout-payment-methods-error');
    expect(box).toHaveTextContent('Не удалось загрузить способы оплаты');
    expect(box).not.toHaveTextContent('stack trace');
    expect(screen.getByTestId('checkout-submit')).toBeDisabled();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByRole('radiogroup')).toBeInTheDocument();
    expect(screen.getByTestId('checkout-submit')).toBeEnabled();
  });

  it.each([
    ['payment_method_required', /Выберите способ оплаты\./],
    ['payment_method_invalid', /не подходит/],
    ['payment_method_unavailable', /сейчас недоступен/],
  ])('400 %s: понятный текст и перезагрузка списка, выбор сброшен', async (code, text) => {
    const user = userEvent.setup();
    let list = [SBP, CARD];
    route(() => Promise.resolve({ methods: list }));
    mocks.post.mockRejectedValue(new ApiError(400, ['raw backend text'], { code }));
    render(<CheckoutPage />, { wrapper: Providers });
    await user.click(await screen.findByRole('radio', { name: /СБП/ }));
    await user.click(screen.getByTestId('checkout-offer'));
    // Сервер убрал СБП: после отказа список перечитывается.
    list = [CARD, CRYPTO];
    await user.click(screen.getByTestId('checkout-submit'));
    const error = await screen.findByTestId('checkout-payment-methods-validation');
    expect(error).toHaveTextContent(text);
    expect(error).not.toHaveTextContent('raw backend text');
    await waitFor(() => expect(methodCalls().length).toBeGreaterThanOrEqual(2));
    await waitFor(() => expect(screen.queryByRole('radio', { name: /СБП/ })).toBeNull());
    for (const radio of screen.getAllByRole('radio')) expect(radio).not.toBeChecked();
  });

  it('503 payment_unavailable: оплата недоступна, кнопка заблокирована', async () => {
    const user = userEvent.setup();
    route(() => Promise.resolve({ methods: [SBP, CARD] }));
    mocks.post.mockRejectedValue(new ApiError(503, ['x'], { code: 'payment_unavailable' }));
    render(<CheckoutPage />, { wrapper: Providers });
    await user.click(await screen.findByRole('radio', { name: /СБП/ }));
    await user.click(screen.getByTestId('checkout-offer'));
    await user.click(screen.getByTestId('checkout-submit'));
    expect(await screen.findByTestId('checkout-payment-unavailable')).toBeInTheDocument();
    expect(screen.getByTestId('checkout-submit')).toBeDisabled();
  });
});
