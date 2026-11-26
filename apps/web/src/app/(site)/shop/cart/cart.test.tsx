import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import { useAuthStore } from '@/lib/auth/store';
import type { CartView } from '@/lib/store/cart';
import type { StoreProduct } from '@/lib/store/catalog';
import ProductPage from '../[slug]/page';
import CartPage from './page';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
}));

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get, post: mocks.post, patch: mocks.patch, delete: mocks.del },
}));
vi.mock('next/navigation', () => ({
  useParams: () => ({ slug: 'ares' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/shop/cart',
}));
vi.mock('@/lib/site/status', () => ({
  useModuleAvailability: () => ({ reason: null, bypass: false, maintenance: null }),
}));

// Фикстуры формы ответа API. Суммы нарочно «не сходятся» с позициями там, где это
// проверяет, что итог берётся у сервера, а не считается на клиенте.
function line(over: Record<string, unknown> = {}) {
  return {
    productId: 'p1',
    variantId: 'v1',
    bundleId: null,
    productType: 'PRIVILEGE',
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
    name: 'Тестовая привилегия',
    ...over,
  };
}

function item(over: Record<string, unknown> = {}) {
  return {
    id: 'i1',
    quantity: 2,
    productId: 'p1',
    variantId: 'v1',
    bundleId: null,
    product: { id: 'p1', name: 'Тестовая привилегия' },
    ...over,
  };
}

function cart(over: Record<string, unknown> = {}): CartView {
  return {
    id: 'cart1',
    items: [item()],
    promoCode: null,
    lines: [line()],
    subtotal: '200.00',
    bulkDiscountTotal: '0',
    loyaltyDiscountPercent: '0',
    loyaltyDiscountTotal: '0',
    promoDiscountTotal: '0',
    discountAmount: '0',
    total: '200.00',
    ...over,
  } as unknown as CartView;
}

const EMPTY = cart({ items: [], lines: [], subtotal: '0', total: '0' });

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
  useAuthStore.setState({ status: 'authenticated', user: { id: 'u1' } } as never);
}

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  useAuthStore.setState({ status: 'anonymous', user: null } as never);
});

describe('корзина /shop/cart', () => {
  it('аноним: приглашение войти, запросов корзины нет', () => {
    render(<CartPage />, { wrapper: Providers });
    expect(screen.getByText('Войдите, чтобы собрать корзину')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Войти' })).toHaveAttribute(
      'href',
      '/login?next=%2Fshop%2Fcart',
    );
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('пустая корзина: пояснение и ссылка в магазин', async () => {
    signIn();
    mocks.get.mockResolvedValue(EMPTY);
    render(<CartPage />, { wrapper: Providers });
    expect(await screen.findByText('Корзина пуста')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'В магазин' })).toHaveAttribute('href', '/shop');
  });

  it('итог — ровно ответ сервера, клиент не пересчитывает позиции', async () => {
    signIn();
    mocks.get.mockResolvedValue(cart({ subtotal: '200.00', total: '777.00' }));
    render(<CartPage />, { wrapper: Providers });
    const total = await screen.findByTestId('cart-total');
    // единственный polite-регион страницы — cart-announce; итог не озвучивается дважды
    expect(total).not.toHaveAttribute('aria-live');
    expect(total).not.toHaveAttribute('role');
    expect(document.querySelectorAll('[aria-live]')).toHaveLength(1);
    expect(total.textContent).toMatch(/777/);
    expect(total.textContent).not.toMatch(/\b200\b/);
    expect(mocks.get).toHaveBeenCalledWith('/store/cart');
  });

  it('разбор скидок: объём, лояльность, промокод — суммы сервера', async () => {
    signIn();
    mocks.get.mockResolvedValue(
      cart({
        lines: [line({ bulkDiscount: '20.00', lineTotal: '180.00' })],
        bulkDiscountTotal: '20.00',
        loyaltyDiscountPercent: '5.00',
        loyaltyDiscountTotal: '9.00',
        promoDiscountTotal: '31.00',
        discountAmount: '60.00',
        promoCode: { code: 'SPRING', description: 'Весенняя акция' },
        total: '140.00',
      }),
    );
    render(<CartPage />, { wrapper: Providers });
    await screen.findByTestId('cart-total');
    const summary = screen.getByRole('region', { name: 'Итог заказа' });
    expect(within(summary).getByText('Скидка за объём').nextSibling?.textContent).toMatch(/−.*20/);
    expect(within(summary).getByText(/Скидка лояльности, 5%/).nextSibling?.textContent).toMatch(
      /−.*9/,
    );
    expect(within(summary).getByText('Промокод SPRING').nextSibling?.textContent).toMatch(/−.*31/);
    expect(within(summary).getByTestId('promo-applied')).toHaveTextContent('Весенняя акция');
    expect(within(summary).getByTestId('cart-total').textContent).toMatch(/140/);
    expect(screen.getByTestId('cart-item').textContent).toMatch(/Скидка за объём −.*20/);
  });

  it('«Оформить заказ» — ссылка на /shop/checkout (0.5)', async () => {
    signIn();
    mocks.get.mockResolvedValue(cart());
    render(<CartPage />, { wrapper: Providers });
    const link = await screen.findByRole('link', { name: /Оформить заказ/ });
    expect(link).toHaveAttribute('href', '/shop/checkout');
    expect(link).toHaveAccessibleDescription(/Ник получателя и оплата/);
  });

  it('количество: «+» шлёт PATCH, показывается ответ сервера', async () => {
    const user = userEvent.setup();
    signIn();
    mocks.get.mockResolvedValue(cart());
    mocks.patch.mockResolvedValue(
      cart({
        items: [item({ quantity: 3 })],
        lines: [line({ quantity: 3, lineSubtotal: '300.00', lineTotal: '300.00' })],
        subtotal: '300.00',
        total: '290.00',
      }),
    );
    render(<CartPage />, { wrapper: Providers });
    await user.click(
      await screen.findByRole('button', { name: 'Увеличить количество: Тестовая привилегия' }),
    );
    expect(mocks.patch).toHaveBeenCalledWith('/store/cart/items/i1', { quantity: 3 });
    await waitFor(() => expect(screen.getByTestId('cart-total').textContent).toMatch(/290/));
    expect(screen.getByTestId('cart-quantity')).toHaveTextContent('3');
  });

  it('ошибка сервера по количеству (maxPerPurchase) показывается понятным текстом', async () => {
    const user = userEvent.setup();
    signIn();
    mocks.get.mockResolvedValue(cart());
    mocks.patch.mockRejectedValue(
      new ApiError(400, ['Максимум 2 шт. этого товара за покупку'], {
        code: 'CART_MAX_PER_PURCHASE',
      }),
    );
    render(<CartPage />, { wrapper: Providers });
    await user.click(
      await screen.findByRole('button', { name: 'Увеличить количество: Тестовая привилегия' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Достигнут максимум: 2 шт.');
  });

  it('удаление позиции: DELETE и объявление для скринридера', async () => {
    const user = userEvent.setup();
    signIn();
    mocks.get.mockResolvedValue(cart());
    mocks.del.mockResolvedValue(EMPTY);
    render(<CartPage />, { wrapper: Providers });
    await user.click(await screen.findByRole('button', { name: 'Удалить: Тестовая привилегия' }));
    expect(mocks.del).toHaveBeenCalledWith('/store/cart/items/i1');
    expect(await screen.findByText('Корзина пуста')).toBeInTheDocument();
    expect(screen.getByTestId('cart-announce')).toHaveTextContent('удалён из корзины');
  });

  it('очистка требует подтверждения: отмена ничего не удаляет, подтверждение — DELETE /store/cart', async () => {
    const user = userEvent.setup();
    signIn();
    mocks.get.mockResolvedValue(cart());
    mocks.del.mockResolvedValue(EMPTY);
    render(<CartPage />, { wrapper: Providers });
    await user.click(await screen.findByRole('button', { name: /Очистить/ }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Очистить корзину?');
    expect(mocks.del).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Отмена' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(mocks.del).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /Очистить/ }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Очистить' }),
    );
    await waitFor(() => expect(mocks.del).toHaveBeenCalledWith('/store/cart'));
    expect(await screen.findByText('Корзина пуста')).toBeInTheDocument();
  });

  it('A-1: после очистки корзины фокус на заголовке «Корзина»', async () => {
    const user = userEvent.setup();
    signIn();
    mocks.get.mockResolvedValue(cart());
    mocks.del.mockResolvedValue(EMPTY);
    render(<CartPage />, { wrapper: Providers });
    await user.click(await screen.findByRole('button', { name: /Очистить/ }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Очистить' }),
    );
    expect(await screen.findByText('Корзина пуста')).toBeInTheDocument();
    const heading = screen.getByRole('heading', { level: 1, name: 'Корзина' });
    expect(heading).toHaveAttribute('tabindex', '-1');
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it('A-1: после удаления последней позиции фокус на заголовке', async () => {
    const user = userEvent.setup();
    signIn();
    mocks.get.mockResolvedValue(cart());
    mocks.del.mockResolvedValue(EMPTY);
    render(<CartPage />, { wrapper: Providers });
    await user.click(await screen.findByRole('button', { name: 'Удалить: Тестовая привилегия' }));
    expect(await screen.findByText('Корзина пуста')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: 'Корзина' })).toHaveFocus(),
    );
  });

  it('A-1: удаление не последней позиции фокус не уводит', async () => {
    const user = userEvent.setup();
    signIn();
    const two = cart({
      items: [item(), item({ id: 'i2', productId: 'p2', product: { id: 'p2', name: 'Вторая' } })],
      lines: [line(), line({ productId: 'p2', name: 'Вторая' })],
    });
    mocks.get.mockResolvedValue(two);
    mocks.del.mockResolvedValue(cart());
    render(<CartPage />, { wrapper: Providers });
    await user.click(await screen.findByRole('button', { name: 'Удалить: Вторая' }));
    await waitFor(() => expect(mocks.del).toHaveBeenCalledWith('/store/cart/items/i2'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByRole('heading', { level: 1, name: 'Корзина' })).not.toHaveFocus();
  });

  it('A-3: ошибка удаления показывается в карточке позиции, а не вверху страницы', async () => {
    const user = userEvent.setup();
    signIn();
    mocks.get.mockResolvedValue(cart());
    mocks.del.mockRejectedValue(new ApiError(409, ['Сбой удаления']));
    render(<CartPage />, { wrapper: Providers });
    await user.click(await screen.findByRole('button', { name: 'Удалить: Тестовая привилегия' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Данные изменились. Обновите страницу и повторите.');
    expect(within(screen.getByTestId('cart-item')).getByRole('alert')).toBe(alert);
    expect(screen.getByRole('heading', { level: 1, name: 'Корзина' })).not.toHaveFocus();
  });

  it('промокод: ошибка сервера у поля, успех — код и описание', async () => {
    const user = userEvent.setup();
    signIn();
    mocks.get.mockResolvedValue(cart());
    mocks.post.mockRejectedValueOnce(new ApiError(404, ['Промокод не найден']));
    render(<CartPage />, { wrapper: Providers });
    const input = await screen.findByRole('textbox', { name: 'Промокод' });
    await user.type(input, 'BAD');
    await user.click(screen.getByRole('button', { name: 'Применить' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Промокод не найден');
    expect(mocks.post).toHaveBeenCalledWith('/store/cart/apply-promo', { code: 'BAD' });
    expect(input).toHaveAttribute('aria-invalid', 'true');

    mocks.post.mockResolvedValueOnce(
      cart({
        promoCode: { code: 'GOOD', description: 'Скидка новичкам' },
        promoDiscountTotal: '20.00',
        total: '180.00',
      }),
    );
    await user.clear(input);
    await user.type(input, 'good');
    await user.click(screen.getByRole('button', { name: 'Применить' }));
    expect(await screen.findByTestId('promo-applied')).toHaveTextContent('GOOD');
    expect(screen.getByTestId('promo-applied')).toHaveTextContent('Скидка новичкам');
    expect(screen.getByTestId('cart-total').textContent).toMatch(/180/);
  });

  it('пустой промокод не отправляется', async () => {
    const user = userEvent.setup();
    signIn();
    mocks.get.mockResolvedValue(cart());
    render(<CartPage />, { wrapper: Providers });
    await user.click(await screen.findByRole('button', { name: 'Применить' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Введите промокод');
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('сохранённый промокод стал недействителен (GET отдаёт 400) — его можно убрать', async () => {
    const user = userEvent.setup();
    signIn();
    mocks.get.mockRejectedValueOnce(new ApiError(400, ['Срок действия промокода истёк']));
    mocks.get.mockResolvedValue(cart());
    mocks.del.mockResolvedValue(cart());
    render(<CartPage />, { wrapper: Providers });
    const problem = await screen.findByTestId('cart-promo-problem');
    expect(problem).toHaveTextContent('Не удалось открыть корзину');
    expect(problem).not.toHaveTextContent('Срок действия промокода истёк');
    await user.click(within(problem).getByRole('button', { name: 'Убрать промокод' }));
    expect(mocks.del).toHaveBeenCalledWith('/store/cart/promo');
    expect(await screen.findByTestId('cart-total')).toBeInTheDocument();
  });

  it('promoError при 200: предупреждение рядом с кодом, скидка не показывается, код можно убрать', async () => {
    const user = userEvent.setup();
    signIn();
    mocks.get.mockResolvedValue(
      cart({
        promoCode: { code: 'OLD', description: 'Старая акция' },
        promoError: { code: 'PROMO_EXPIRED', message: 'Серверный текст' },
        promoDiscountTotal: '0',
      }),
    );
    mocks.del.mockResolvedValue(cart());
    render(<CartPage />, { wrapper: Providers });
    const applied = await screen.findByTestId('promo-applied');
    expect(within(applied).getByTestId('promo-error')).toHaveTextContent(
      'Срок действия промокода истёк',
    );
    expect(within(applied).getByTestId('promo-error')).toHaveTextContent('не применяется');
    // Строки скидки по промокоду в итоге нет.
    expect(screen.queryByText('Промокод OLD')).not.toBeInTheDocument();
    expect(within(applied).getByTestId('promo-error')).toHaveAttribute('role', 'status');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(within(applied).getByRole('button', { name: 'Убрать промокод OLD' }));
    expect(mocks.del).toHaveBeenCalledWith('/store/cart/promo');
  });

  it('promoError с неизвестным кодом показывает текст сервера', async () => {
    signIn();
    mocks.get.mockResolvedValue(
      cart({
        promoCode: { code: 'X1' },
        promoError: { code: 'PROMO_NEW_RULE', message: 'Новое правило промокода' },
      }),
    );
    render(<CartPage />, { wrapper: Providers });
    expect(await screen.findByTestId('promo-error')).toHaveTextContent('Новое правило промокода');
  });

  it('ошибки по коду: PROMO_*, CART_UNIQUE_*, CART_GIFT_* — русские тексты', async () => {
    const { cartErrorMessage } = await import('@/lib/store/cart');
    const err = (code: string, message = 'text') => new ApiError(400, [message], { code });
    expect(cartErrorMessage(err('PROMO_EXHAUSTED'))).toMatch(/исчерпан/);
    expect(cartErrorMessage(err('PROMO_MIN_AMOUNT'))).toMatch(/минимальной/);
    expect(cartErrorMessage(err('CART_UNIQUE_DUPLICATE'))).toMatch(/один раз/);
    expect(cartErrorMessage(err('CART_UNIQUE_ALREADY_OWNED'))).toMatch(/уже есть/);
    // CART_GIFT_NOT_ALLOWED (400): товар не подарочный; CART_GIFT_UNAVAILABLE (404): игрок.
    expect(cartErrorMessage(err('CART_GIFT_NOT_ALLOWED'))).toMatch(/не подарочный|только для себя/);
    expect(cartErrorMessage(new ApiError(404, ['x'], { code: 'CART_GIFT_UNAVAILABLE' }))).toMatch(
      /Такого игрока нет/,
    );
    expect(cartErrorMessage(err('PROMO_NOT_STARTED'))).toMatch(/ещё не начал/);
    expect(cartErrorMessage(err('PROMO_FIRST_PURCHASE_ONLY'))).toMatch(/первую покупку/);
    // Кода PROMO_ALREADY_USED в API нет — общий текст по статусу, без сырого сообщения.
    expect(cartErrorMessage(err('PROMO_ALREADY_USED', 'Серверный'))).toBe(
      'Проверьте введённые данные и повторите.',
    );
    // Лимит на покупку: число берём из текста сервера, сам текст не показываем.
    expect(cartErrorMessage(err('CART_MAX_PER_PURCHASE', 'Максимум 2 шт.'))).toBe(
      'Достигнут максимум: 2 шт. этого товара за одну покупку.',
    );
    // Неизвестный код — общий текст по статусу, без сырого сообщения.
    expect(cartErrorMessage(err('SOMETHING_NEW', 'Новая ошибка'))).toBe(
      'Проверьте введённые данные и повторите.',
    );
  });

  it('promoError без promoCode не теряется: показывается рядом с формой', async () => {
    signIn();
    mocks.get.mockResolvedValue(
      cart({ promoCode: null, promoError: { code: 'PROMO_EXPIRED', message: 'x' } }),
    );
    render(<CartPage />, { wrapper: Providers });
    const warning = await screen.findByTestId('promo-error');
    expect(warning).toHaveTextContent('Срок действия промокода истёк');
    expect(warning).toHaveAttribute('role', 'status');
    expect(screen.getByRole('textbox', { name: 'Промокод' })).toBeInTheDocument();
  });

  it('запасной разбор по тексту (старый API без code)', async () => {
    const user = userEvent.setup();
    signIn();
    mocks.get.mockResolvedValue(cart());
    mocks.post.mockRejectedValueOnce(new ApiError(400, ['Срок действия промокода истёк']));
    render(<CartPage />, { wrapper: Providers });
    await user.type(await screen.findByRole('textbox', { name: 'Промокод' }), 'OLD');
    await user.click(screen.getByRole('button', { name: 'Применить' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Срок действия промокода истёк.');
    const { cartErrorMessage } = await import('@/lib/store/cart');
    expect(cartErrorMessage(new ApiError(400, ['Сумма ниже минимальной']))).toMatch(
      /минимальной для этого промокода/,
    );
    expect(cartErrorMessage(new ApiError(400, ['Что-то своё']))).toBe(
      'Проверьте введённые данные и повторите.',
    );
  });

  it('429 на подарок: понятное сообщение с Retry-After', async () => {
    const user = userEvent.setup();
    signIn();
    mocks.get.mockResolvedValue(cart());
    const limited = new ApiError(429, ['Лимит'], {
      code: 'CART_GIFT_RATE_LIMITED',
      body: { statusCode: 429, code: 'CART_GIFT_RATE_LIMITED', message: 'Лимит', retryAfter: 45 },
    });
    limited.retryAfterSeconds = 45;
    mocks.patch.mockRejectedValue(limited);
    render(<CartPage />, { wrapper: Providers });
    await user.click(await screen.findByRole('button', { name: 'Подарить' }));
    await user.type(screen.getByLabelText(/Ник получателя/), 'Friend');
    await user.click(screen.getByRole('button', { name: 'Подарить' }));
    expect(await screen.findByText(/Повторите через 45 сек\./)).toBeInTheDocument();
  });

  it('429: секунды берутся из тела, если заголовка нет', async () => {
    const { cartErrorMessage } = await import('@/lib/store/cart');
    const error = new ApiError(429, ['x'], {
      code: 'CART_GIFT_RATE_LIMITED',
      body: { retryAfter: 120 },
    });
    expect(cartErrorMessage(error)).toMatch(/Повторите через 2 мин\./);
    expect(cartErrorMessage(new ApiError(429, ['x']))).toMatch(/чуть позже/);
  });

  it('подарок: ник и сообщение уходят в PATCH', async () => {
    const user = userEvent.setup();
    signIn();
    mocks.get.mockResolvedValue(cart());
    mocks.patch.mockResolvedValue(
      cart({ lines: [line({ giftToUserId: 'u2', giftMessage: 'С праздником' })] }),
    );
    render(<CartPage />, { wrapper: Providers });
    await user.click(await screen.findByRole('button', { name: 'Подарить' }));
    await user.type(screen.getByLabelText(/Ник получателя/), 'Friend');
    await user.type(screen.getByLabelText('Сообщение'), 'С праздником');
    await user.click(screen.getByRole('button', { name: 'Подарить' }));
    expect(mocks.patch).toHaveBeenCalledWith('/store/cart/items/i1', {
      giftToUsername: 'Friend',
      giftMessage: 'С праздником',
    });
    expect(await screen.findByText('Подарок для Friend')).toBeInTheDocument();
  });

  it('товар «только для себя» не предлагает подарок', async () => {
    signIn();
    mocks.get.mockResolvedValue(cart({ lines: [line({ isSelfOnly: true })] }));
    render(<CartPage />, { wrapper: Providers });
    await screen.findByTestId('cart-item');
    expect(screen.queryByRole('button', { name: 'Подарить' })).not.toBeInTheDocument();
  });

  it('в исходниках нет хардкода цен, расчётов и glass/blur', () => {
    for (const file of ['page.tsx', '../../../../lib/store/cart.ts']) {
      const source = readFileSync(join(__dirname, file), 'utf8');
      expect(source, file).not.toMatch(/backdrop-blur|\bblur-|glass/i);
      expect(source, file).not.toMatch(/['"`]\d+[.,]\d{2}['"`]/);
      expect(source, file).not.toMatch(/₽\s?\d|\d\s?₽/);
      expect(source, file).not.toMatch(
        /unitPrice\)?\s*\*|lineTotal\)?\s*[+*]|Number\(\w+\.total\)/,
      );
    }
  });
});

const PRODUCT: StoreProduct = {
  id: 'p1',
  name: 'Тестовая привилегия',
  slug: 'ares',
  description: 'Описание',
  image: null,
  isUnique: false,
  maxPerPurchase: 3,
  variants: [{ id: 'v1', duration: 'MONTH_1', price: '150.00' }],
};

function productRoutes(product: StoreProduct, current: CartView = EMPTY) {
  mocks.get.mockImplementation((path: string) => {
    if (path === '/store/products/ares') return Promise.resolve(product);
    if (path === '/store/products/ares/bought-together') return Promise.resolve([]);
    if (path === '/store/cart') return Promise.resolve(current);
    return Promise.reject(new ApiError(404, ['Not found']));
  });
}

describe('«В корзину» на /shop/[slug]', () => {
  it('добавляет выбранный вариант через API и сообщает об успехе', async () => {
    const user = userEvent.setup();
    signIn();
    productRoutes(PRODUCT);
    mocks.post.mockResolvedValue(cart());
    render(<ProductPage />, { wrapper: Providers });
    await screen.findByText('Оплата заказа появится в ближайшем обновлении.');
    await user.click(await screen.findByRole('button', { name: /В корзину/ }));
    expect(mocks.post).toHaveBeenCalledWith('/store/cart/items', { variantId: 'v1', quantity: 1 });
    expect(await screen.findByTestId('cart-feedback')).toHaveTextContent('добавлен в корзину');
    expect(screen.getByRole('link', { name: 'Перейти в корзину' })).toHaveAttribute(
      'href',
      '/shop/cart',
    );
  });

  it('тот же вариант уже в корзине: увеличивает количество вместо дубля', async () => {
    const user = userEvent.setup();
    signIn();
    productRoutes(PRODUCT, cart());
    mocks.patch.mockResolvedValue(cart());
    render(<ProductPage />, { wrapper: Providers });
    await screen.findByText(/В корзине уже 2 шт\. этого варианта/);
    await user.click(screen.getByRole('button', { name: /В корзину/ }));
    // в корзине 2, лимит за покупку 3: ещё одна штука допустима
    expect(mocks.patch).toHaveBeenCalledWith('/store/cart/items/i1', { quantity: 3 });
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('maxPerPurchase: сверх лимита с учётом корзины не отправляется', async () => {
    const user = userEvent.setup();
    signIn();
    productRoutes(PRODUCT, cart({ items: [item({ quantity: 3 })] }));
    render(<ProductPage />, { wrapper: Providers });
    await screen.findByText(/В корзине уже 3 шт\. этого варианта/);
    await user.click(screen.getByRole('button', { name: /В корзину/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('не больше 3');
    expect(mocks.patch).not.toHaveBeenCalled();
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('ошибка API при добавлении показывается общим текстом по статусу', async () => {
    const user = userEvent.setup();
    signIn();
    productRoutes(PRODUCT);
    mocks.post.mockRejectedValue(new ApiError(404, ['Вариант товара не найден']));
    render(<ProductPage />, { wrapper: Providers });
    await screen.findByText('Оплата заказа появится в ближайшем обновлении.');
    await user.click(await screen.findByRole('button', { name: /В корзину/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не найдено: возможно, это уже удалено.',
    );
  });

  it('уникальный товар, уже лежащий в корзине, повторно не добавляется', async () => {
    const user = userEvent.setup();
    signIn();
    productRoutes({ ...PRODUCT, isUnique: true }, cart({ items: [item({ quantity: 1 })] }));
    render(<ProductPage />, { wrapper: Providers });
    await screen.findByText('Уникальный товар уже в корзине.');
    const button = screen.getByRole('button', { name: /В корзину/ });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    await user.click(button);
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.patch).not.toHaveBeenCalled();
  });

  it('Q1: пока корзина грузится, «В корзину» неактивна и не отправляет запрос (уникальный товар)', async () => {
    const user = userEvent.setup();
    signIn();
    let release: (value: CartView) => void = () => {};
    mocks.get.mockImplementation((path: string) => {
      if (path === '/store/products/ares') return Promise.resolve({ ...PRODUCT, isUnique: true });
      if (path === '/store/products/ares/bought-together') return Promise.resolve([]);
      if (path === '/store/cart') return new Promise<CartView>((resolve) => (release = resolve));
      return Promise.reject(new ApiError(404, ['Not found']));
    });
    render(<ProductPage />, { wrapper: Providers });
    const button = await screen.findByRole('button', { name: /В корзину/ });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Загружаем корзину…')).toBeInTheDocument();
    await user.click(button);
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.patch).not.toHaveBeenCalled();

    release(cart({ items: [item({ quantity: 1 })] }));
    await screen.findByText('Уникальный товар уже в корзине.');
    expect(button).toHaveAttribute('aria-disabled', 'true');
  });

  it('Q1: после загрузки пустой корзины кнопка становится доступной', async () => {
    signIn();
    productRoutes(PRODUCT);
    render(<ProductPage />, { wrapper: Providers });
    await screen.findByText('Оплата заказа появится в ближайшем обновлении.');
    expect(screen.getByRole('button', { name: /В корзину/ })).not.toHaveAttribute('aria-disabled');
  });

  it('аноним: кнопка неактивна, запросов корзины нет', async () => {
    const user = userEvent.setup();
    productRoutes(PRODUCT);
    render(<ProductPage />, { wrapper: Providers });
    const button = await screen.findByRole('button', { name: /В корзину/ });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    await user.click(button);
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalledWith('/store/cart');
  });
});
