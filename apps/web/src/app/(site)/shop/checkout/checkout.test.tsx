import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import { useAuthStore } from '@/lib/auth/store';
import type { CartView } from '@/lib/store/cart';
import { describeCheckoutError, safePaymentUrl, type CheckoutConfig } from '@/lib/store/checkout';
import CheckoutPage from './page';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  push: vi.fn(),
}));

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
      quantity: 2,
      productId: 'p1',
      variantId: 'v1',
      bundleId: null,
      product: { id: 'p1', name: 'Тестовый товар' },
    },
  ],
  promoCode: null,
  lines: [
    {
      productId: 'p1',
      variantId: 'v1',
      bundleId: null,
      quantity: 2,
      unitPrice: '100.00',
      lineSubtotal: '200.00',
      bulkDiscount: '0',
      lineTotal: '200.00',
      giftToUserId: null,
      giftMessage: null,
      isGiftable: true,
      isSelfOnly: false,
      isUnique: false,
      name: 'Тестовый товар',
    },
  ],
  subtotal: '200.00',
  bulkDiscountTotal: '0',
  loyaltyDiscountPercent: '0',
  loyaltyDiscountTotal: '0',
  promoDiscountTotal: '0',
  discountAmount: '0',
  total: '777.00',
} as unknown as CartView;

const CONFIG: CheckoutConfig = { offerVersion: '3', paymentAvailable: true, quickBuyEnabled: true };

function route(config: CheckoutConfig = CONFIG, cart: unknown = CART) {
  mocks.get.mockImplementation((path: string) => {
    if (path === '/store/cart') return Promise.resolve(cart);
    if (path === '/store/checkout-config') return Promise.resolve(config);
    if (path === '/store/payment-methods') return Promise.resolve({ methods: [] });
    if (path.startsWith('/users/')) {
      return Promise.resolve({ id: 'u1', username: 'steve', minecraftName: 'Steve_MC' });
    }
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

function signIn() {
  useAuthStore.setState({
    status: 'authenticated',
    user: { id: 'u1', username: 'steve' },
  } as never);
}

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  useAuthStore.setState({ status: 'anonymous', user: null } as never);
});

describe('оформление /shop/checkout', () => {
  it('аноним: приглашение войти с возвратом на оформление, запросов нет', () => {
    render(<CheckoutPage />, { wrapper: Providers });
    expect(screen.getByRole('link', { name: 'Войти' })).toHaveAttribute(
      'href',
      '/login?next=%2Fshop%2Fcheckout',
    );
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('пустая корзина: ссылка в магазин, формы нет', async () => {
    signIn();
    route(CONFIG, { ...CART, items: [], lines: [] });
    render(<CheckoutPage />, { wrapper: Providers });
    expect(await screen.findByText('Корзина пуста')).toBeInTheDocument();
    expect(screen.queryByTestId('checkout-submit')).not.toBeInTheDocument();
  });

  it('сводка: итог ровно из ответа сервера, подсказка своего ника, ссылка на оферту', async () => {
    signIn();
    route();
    render(<CheckoutPage />, { wrapper: Providers });
    const total = await screen.findByTestId('checkout-total');
    expect(total.textContent).toMatch(/777/);
    expect(total.textContent).not.toMatch(/\b200\b/);
    expect(await screen.findByText(/Steve_MC/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /условия оферты/ })).toHaveAttribute(
      'href',
      '/legal/terms',
    );
  });

  it('без согласия: заказ не создаётся, ошибка у чекбокса, фокус на нём', async () => {
    const user = userEvent.setup();
    signIn();
    route();
    render(<CheckoutPage />, { wrapper: Providers });
    await user.click(await screen.findByTestId('checkout-submit'));
    const box = screen.getByRole('checkbox');
    expect(box).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('checkout-offer-error')).toBeInTheDocument();
    await waitFor(() => expect(box).toHaveFocus());
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('оплата: шлёт версию оферты и ник, null paymentUrl — переход на страницу заказа', async () => {
    const user = userEvent.setup();
    signIn();
    route();
    mocks.post.mockResolvedValue({
      order: { orderNumber: 'TW-1', status: 'PENDING' },
      paymentUrl: null,
    });
    render(<CheckoutPage />, { wrapper: Providers });
    await user.type(await screen.findByTestId('checkout-nick'), ' Alex ');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByTestId('checkout-submit'));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/shop/orders/TW-1'));
    expect(mocks.post).toHaveBeenCalledWith('/store/orders', {
      offerVersion: '3',
      targetMinecraftNick: 'Alex',
    });
  });

  describe('переход на paymentUrl', () => {
    const assign = vi.fn();
    beforeEach(() => {
      assign.mockReset();
      vi.stubGlobal('location', { ...window.location, assign });
    });
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    async function pay(paymentUrl: string) {
      const user = userEvent.setup();
      signIn();
      route();
      mocks.post.mockResolvedValue({ order: { orderNumber: 'TW-9' }, paymentUrl });
      render(<CheckoutPage />, { wrapper: Providers });
      await screen.findByTestId('checkout-nick');
      await user.click(screen.getByRole('checkbox'));
      await user.click(screen.getByTestId('checkout-submit'));
      await waitFor(() => expect(mocks.post).toHaveBeenCalled());
    }

    it('https-адрес: переход к провайдеру, кнопка заблокирована, push нет', async () => {
      await pay('https://pay.example/x');
      await waitFor(() => expect(assign).toHaveBeenCalledWith('https://pay.example/x'));
      expect(mocks.push).not.toHaveBeenCalled();
      expect(screen.getByTestId('checkout-submit')).toBeDisabled();
    });

    it.each([
      'javascript:alert(1)',
      'http://pay.example/x',
      'data:text/html,x',
      'HTTP://evil.test',
    ])('небезопасный адрес %s отвергается: перехода нет, страница заказа', async (url) => {
      await pay(url);
      await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/shop/orders/TW-9'));
      expect(assign).not.toHaveBeenCalled();
    });

    it('возврат на страницу (pageshow из bfcache) снимает блокировку кнопки', async () => {
      await pay('https://pay.example/x');
      await waitFor(() => expect(screen.getByTestId('checkout-submit')).toBeDisabled());
      act(() => {
        window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
      });
      await waitFor(() => expect(screen.getByTestId('checkout-submit')).not.toBeDisabled());
    });
  });

  it('пустой ник не отправляется (сервер берёт привязанный)', async () => {
    const user = userEvent.setup();
    signIn();
    route();
    mocks.post.mockResolvedValue({ order: { orderNumber: 'TW-2' }, paymentUrl: null });
    render(<CheckoutPage />, { wrapper: Providers });
    await screen.findByTestId('checkout-nick');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByTestId('checkout-submit'));
    await waitFor(() => expect(mocks.post).toHaveBeenCalled());
    expect(mocks.post).toHaveBeenCalledWith('/store/orders', { offerVersion: '3' });
  });

  it('nick_unavailable: единая ошибка у поля ника, фокус на поле', async () => {
    const user = userEvent.setup();
    signIn();
    route();
    mocks.post.mockRejectedValue(new ApiError(400, ['x'], { code: 'nick_unavailable' } as never));
    render(<CheckoutPage />, { wrapper: Providers });
    const nick = await screen.findByTestId('checkout-nick');
    await user.type(nick, 'Ghost');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByTestId('checkout-submit'));
    await waitFor(() => expect(nick).toHaveAttribute('aria-invalid', 'true'));
    expect(nick).toHaveAccessibleDescription(/нельзя/);
    await waitFor(() => expect(nick).toHaveFocus());
  });

  it('offer_version_mismatch: согласие сбрасывается, конфигурация перечитывается', async () => {
    const user = userEvent.setup();
    signIn();
    route();
    mocks.post.mockRejectedValue(
      new ApiError(400, ['x'], { code: 'offer_version_mismatch' } as never),
    );
    render(<CheckoutPage />, { wrapper: Providers });
    await screen.findByTestId('checkout-nick');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByTestId('checkout-submit'));
    await waitFor(() => expect(screen.getByRole('checkbox')).not.toBeChecked());
    expect(screen.getByTestId('checkout-offer-error').textContent).toMatch(/Оферта обновилась/);
    await waitFor(() =>
      expect(mocks.get.mock.calls.filter(([p]) => p === '/store/checkout-config').length).toBe(2),
    );
  });

  it('конфигурация: оплата недоступна — честное сообщение и неактивная кнопка', async () => {
    signIn();
    route({ ...CONFIG, paymentAvailable: false });
    render(<CheckoutPage />, { wrapper: Providers });
    expect(await screen.findByTestId('checkout-payment-unavailable')).toHaveTextContent(
      'Оплата временно недоступна',
    );
    expect(screen.getByTestId('checkout-submit')).toBeDisabled();
  });

  it('503 payment_unavailable при отправке: сообщение и блокировка кнопки', async () => {
    const user = userEvent.setup();
    signIn();
    route();
    mocks.post.mockRejectedValue(
      new ApiError(503, ['Оплата временно недоступна'], { code: 'payment_unavailable' } as never),
    );
    render(<CheckoutPage />, { wrapper: Providers });
    await screen.findByTestId('checkout-nick');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByTestId('checkout-submit'));
    expect(await screen.findByTestId('checkout-payment-unavailable')).toBeInTheDocument();
    expect(screen.getByTestId('checkout-submit')).toBeDisabled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('неактивная «Оплатить» связана с причиной через aria-describedby', async () => {
    signIn();
    route({ ...CONFIG, paymentAvailable: false });
    render(<CheckoutPage />, { wrapper: Providers });
    const reason = await screen.findByTestId('checkout-payment-unavailable');
    const submit = screen.getByTestId('checkout-submit');
    expect(reason.id).not.toBe('');
    expect(submit).toHaveAttribute('aria-describedby', reason.id);
    expect(submit).toHaveAccessibleDescription(/Оплата временно недоступна/);
  });

  it('503 при отправке: aria-describedby указывает на сообщение', async () => {
    const user = userEvent.setup();
    signIn();
    route();
    mocks.post.mockRejectedValue(
      new ApiError(503, ['Оплата временно недоступна'], { code: 'payment_unavailable' } as never),
    );
    render(<CheckoutPage />, { wrapper: Providers });
    await screen.findByTestId('checkout-nick');
    expect(screen.getByTestId('checkout-submit')).not.toHaveAttribute('aria-describedby');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByTestId('checkout-submit'));
    const reason = await screen.findByTestId('checkout-payment-unavailable');
    expect(screen.getByTestId('checkout-submit')).toHaveAttribute('aria-describedby', reason.id);
  });

  it('возврат на вкладку перепроверяет конфигурацию: оплата снова доступна', async () => {
    signIn();
    route({ ...CONFIG, paymentAvailable: false });
    render(<CheckoutPage />, { wrapper: Providers });
    await screen.findByTestId('checkout-payment-unavailable');
    expect(screen.getByTestId('checkout-submit')).toBeDisabled();
    route(CONFIG);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(screen.getByTestId('checkout-submit')).toBeEnabled());
    expect(screen.queryByTestId('checkout-payment-unavailable')).not.toBeInTheDocument();
  });

  it('сбой перепроверки конфигурации не ломает форму', async () => {
    signIn();
    route({ ...CONFIG, paymentAvailable: false });
    render(<CheckoutPage />, { wrapper: Providers });
    await screen.findByTestId('checkout-payment-unavailable');
    const before = mocks.get.mock.calls.length;
    mocks.get.mockRejectedValue(new ApiError(500, ['boom']));
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(mocks.get.mock.calls.length).toBeGreaterThan(before));
    expect(screen.getByTestId('checkout-payment-unavailable')).toBeInTheDocument();
    expect(screen.getByTestId('checkout-submit')).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Повторить/ })).not.toBeInTheDocument();
  });
});

describe('логика оформления', () => {
  it('describeCheckoutError: коды и поля', () => {
    const err = (status: number, code: string) => new ApiError(status, ['m'], { code } as never);
    expect(describeCheckoutError(err(400, 'nick_required')).field).toBe('nick');
    expect(describeCheckoutError(err(400, 'offer_not_accepted')).field).toBe('offer');
    expect(describeCheckoutError(err(400, 'offer_version_mismatch')).offerOutdated).toBe(true);
    expect(describeCheckoutError(err(503, 'payment_unavailable')).paymentUnavailable).toBe(true);
    expect(describeCheckoutError(err(403, 'quick_buy_disabled')).message).toMatch(/Войдите/);
    expect(describeCheckoutError(new Error('x')).message).toBe('Не удалось оформить заказ.');
  });

  it('safePaymentUrl пропускает только https (http лишь для localhost)', () => {
    expect(safePaymentUrl('http://pay.example/x')).toBeNull();
    expect(safePaymentUrl('http://localhost:3000/pay')).toBe('http://localhost:3000/pay');
    expect(safePaymentUrl(null)).toBeNull();
    expect(safePaymentUrl('javascript:alert(1)')).toBeNull();
    expect(safePaymentUrl('not a url')).toBeNull();
    expect(safePaymentUrl('https://pay.example/x')).toBe('https://pay.example/x');
  });
});
