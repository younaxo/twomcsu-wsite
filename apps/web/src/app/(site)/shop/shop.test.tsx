import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import { useAuthStore } from '@/lib/auth/store';
import { priceSummary, quantityLimit, type StoreProduct } from '@/lib/store/catalog';
import ProductPage from './[slug]/page';
import ShopPage from './page';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  slug: 'ares',
  reason: null as null | 'MODULE_DISABLED',
}));

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get },
}));
vi.mock('next/navigation', () => ({
  useParams: () => ({ slug: mocks.slug }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/shop',
}));
vi.mock('@/lib/site/status', () => ({
  useModuleAvailability: () => ({ reason: mocks.reason, bypass: false, maintenance: null }),
}));

// Данные ниже — фикстуры формы ответа API, а не данные сайта.
const CATEGORIES = [
  { id: 'c1', name: 'Привилегии', slug: 'privileges', parentId: null },
  { id: 'c2', name: 'Ключи', slug: 'keys', parentId: null },
];

const PRODUCT: StoreProduct = {
  id: 'p1',
  name: 'Тестовая привилегия',
  slug: 'ares',
  description: 'Краткое описание',
  fullDescription: 'Полное **описание**',
  image: null,
  category: { id: 'c1', name: 'Привилегии', slug: 'privileges' },
  isUnique: false,
  maxPerPurchase: 5,
  variants: [
    { id: 'v2', duration: 'FOREVER', price: '900.00', oldPrice: '1200.00' },
    { id: 'v1', duration: 'MONTH_1', price: '150.00' },
  ],
};

function list(items: StoreProduct[]) {
  return { items, total: items.length, page: 1, limit: 24 };
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

function route(map: Record<string, unknown>) {
  mocks.get.mockImplementation((path: string) => {
    const value = map[path];
    if (value instanceof Error) return Promise.reject(value);
    if (value === undefined) return Promise.reject(new ApiError(404, ['Not found']));
    return Promise.resolve(value);
  });
}

beforeEach(() => {
  mocks.get.mockReset();
  mocks.reason = null;
  mocks.slug = 'ares';
  useAuthStore.setState({ status: 'anonymous', user: null } as never);
});

describe('каталог /shop', () => {
  it('показывает товары из API: цена «от» по минимальному варианту, ссылка на карточку', async () => {
    route({ '/store/categories': CATEGORIES, '/store/products': list([PRODUCT]) });
    render(<ShopPage />, { wrapper: Providers });
    const catalog = await screen.findByTestId('catalog-list');
    const link = within(catalog).getByRole('link', { name: 'Тестовая привилегия' });
    expect(link).toHaveAttribute('href', '/shop/ares');
    expect(within(catalog).getByText('от')).toBeInTheDocument();
    expect(catalog.textContent).toMatch(/150/);
    expect(catalog.textContent).not.toMatch(/900/);
  });

  it('состояние загрузки — скелетон', () => {
    mocks.get.mockImplementation(() => new Promise(() => {}));
    render(<ShopPage />, { wrapper: Providers });
    expect(screen.getByTestId('catalog-skeleton')).toBeInTheDocument();
  });

  it('пустой каталог — пояснение без кнопки сброса', async () => {
    route({ '/store/categories': [], '/store/products': list([]) });
    render(<ShopPage />, { wrapper: Providers });
    expect(await screen.findByText('Товаров пока нет')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Сбросить/ })).not.toBeInTheDocument();
  });

  it('фильтр категории отправляет categorySlug, поиск — search; пустой результат сбрасывается', async () => {
    const user = userEvent.setup();
    route({ '/store/categories': CATEGORIES, '/store/products': list([PRODUCT]) });
    render(<ShopPage />, { wrapper: Providers });
    await screen.findByTestId('catalog-list');

    await user.click(screen.getByRole('button', { name: 'Ключи' }));
    await waitFor(() =>
      expect(mocks.get).toHaveBeenCalledWith(
        '/store/products',
        expect.objectContaining({
          query: expect.objectContaining({ categorySlug: 'keys', page: 1 }),
        }),
      ),
    );
    expect(screen.getByRole('button', { name: 'Ключи' })).toHaveAttribute('aria-pressed', 'true');

    route({ '/store/categories': CATEGORIES, '/store/products': list([]) });
    await user.type(screen.getByRole('searchbox', { name: 'Поиск товара по названию' }), 'xyz');
    expect(await screen.findByText('Ничего не найдено')).toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledWith(
      '/store/products',
      expect.objectContaining({
        query: expect.objectContaining({ search: 'xyz', categorySlug: 'keys' }),
      }),
    );
    await user.click(screen.getByRole('button', { name: /Сбросить фильтры/ }));
    expect(screen.getByRole('button', { name: 'Все' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('ошибка загрузки — ErrorState с повтором', async () => {
    route({
      '/store/categories': CATEGORIES,
      '/store/products': new ApiError(500, ['boom']),
    });
    render(<ShopPage />, { wrapper: Providers });
    expect(await screen.findByRole('button', { name: /Повторить/ })).toBeInTheDocument();
  });

  it('API ответил 503 MODULE_DISABLED — понятное состояние, а не «ошибка данных»', async () => {
    route({
      '/store/categories': CATEGORIES,
      '/store/products': new ApiError(503, ['off'], { code: 'MODULE_DISABLED' }),
    });
    render(<ShopPage />, { wrapper: Providers });
    expect(await screen.findByText('Раздел временно недоступен')).toBeInTheDocument();
  });

  it('модуль выключен — состояние вместо каталога, запросов нет', () => {
    mocks.reason = 'MODULE_DISABLED';
    render(<ShopPage />, { wrapper: Providers });
    expect(screen.getByTestId('module-unavailable')).toBeInTheDocument();
    expect(mocks.get).not.toHaveBeenCalled();
  });
});

describe('карточка /shop/[slug]', () => {
  it('варианты и цены из API, «В корзину» неактивна, вход ведёт обратно на товар', async () => {
    route({ '/store/products/ares': PRODUCT, '/store/products/ares/bought-together': [] });
    render(<ProductPage />, { wrapper: Providers });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Тестовая привилегия' }),
    ).toBeVisible();
    const group = screen.getByRole('group', { name: 'Вариант' });
    const radios = within(group).getAllByRole('radio');
    expect(radios).toHaveLength(2);
    // по умолчанию выбран самый дешёвый, даже если API отдал варианты не по порядку
    expect(within(group).getByRole('radio', { name: /1 месяц/ })).toBeChecked();
    expect(group.textContent).toMatch(/900/);
    expect(group.textContent).toMatch(/1\s?200/);

    const cart = screen.getByRole('button', { name: /В корзину/ });
    expect(cart).toHaveAttribute('aria-disabled', 'true');
    expect(cart).toHaveAccessibleDescription(/Корзина и оформление/);
    const login = screen.getByRole('link', { name: 'Войти' });
    expect(login).toHaveAttribute('href', '/login?next=%2Fshop%2Fares');
    expect(screen.queryByRole('link', { name: /корзин/i })).not.toBeInTheDocument();
  });

  it('количество ограничено maxPerPurchase, выбор варианта меняется с клавиатуры', async () => {
    const user = userEvent.setup();
    route({ '/store/products/ares': PRODUCT, '/store/products/ares/bought-together': [] });
    render(<ProductPage />, { wrapper: Providers });
    await screen.findByRole('heading', { level: 1 });
    const qty = screen.getByRole('spinbutton', { name: 'Количество' });
    expect(qty).toHaveAttribute('max', '5');
    await user.clear(qty);
    await user.type(qty, '99');
    expect(qty).toHaveValue(5);
    expect(screen.getByRole('button', { name: 'Увеличить количество' })).toBeDisabled();
    expect(screen.getByText('Не больше 5 за одну покупку.')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: /Навсегда/ }));
    expect(screen.getByRole('radio', { name: /Навсегда/ })).toBeChecked();
  });

  it('уникальный товар: количество зафиксировано, пометка «уже куплено» — если API её отдал', async () => {
    route({
      '/store/products/ares': { ...PRODUCT, isUnique: true, alreadyPurchased: true },
      '/store/products/ares/bought-together': [],
    });
    render(<ProductPage />, { wrapper: Providers });
    expect(await screen.findByTestId('already-purchased')).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.getByText(/Уникальный товар/)).toBeInTheDocument();
  });

  it('без поля alreadyPurchased пометки нет (устойчивость к отсутствию поля)', async () => {
    route({
      '/store/products/ares': { ...PRODUCT, isUnique: true },
      '/store/products/ares/bought-together': [],
    });
    render(<ProductPage />, { wrapper: Providers });
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByTestId('already-purchased')).not.toBeInTheDocument();
  });

  it('нет активных вариантов — «Нет в наличии», кнопки покупки нет', async () => {
    route({
      '/store/products/ares': {
        ...PRODUCT,
        variants: [{ id: 'v9', price: '10.00', isActive: false }],
      },
      '/store/products/ares/bought-together': [],
    });
    render(<ProductPage />, { wrapper: Providers });
    expect(await screen.findByTestId('unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /В корзину/ })).not.toBeInTheDocument();
  });

  it('«Покупают вместе» показывается, только если есть данные', async () => {
    const other: StoreProduct = { ...PRODUCT, id: 'p2', slug: 'zeus', name: 'Другой товар' };
    route({ '/store/products/ares': PRODUCT, '/store/products/ares/bought-together': [other] });
    render(<ProductPage />, { wrapper: Providers });
    const block = await screen.findByTestId('bought-together');
    expect(within(block).getByRole('link', { name: 'Другой товар' })).toHaveAttribute(
      'href',
      '/shop/zeus',
    );
  });

  it('загрузка, 404 и ошибка сервера', async () => {
    mocks.get.mockImplementation(() => new Promise(() => {}));
    const { unmount } = render(<ProductPage />, { wrapper: Providers });
    expect(screen.getByTestId('product-skeleton')).toBeInTheDocument();
    unmount();

    route({});
    const second = render(<ProductPage />, { wrapper: Providers });
    expect(await screen.findByText('Товар не найден')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Вернуться в магазин' })).toHaveAttribute(
      'href',
      '/shop',
    );
    second.unmount();

    route({ '/store/products/ares': new ApiError(500, ['boom']) });
    render(<ProductPage />, { wrapper: Providers });
    expect(await screen.findByRole('button', { name: /Повторить/ })).toBeInTheDocument();
  });

  it('модуль выключен — состояние вместо товара', () => {
    mocks.reason = 'MODULE_DISABLED';
    render(<ProductPage />, { wrapper: Providers });
    expect(screen.getByTestId('module-unavailable')).toBeInTheDocument();
    expect(mocks.get).not.toHaveBeenCalled();
  });
});

describe('помощники каталога', () => {
  it('priceSummary: диапазон, один вариант, нет вариантов', () => {
    expect(priceSummary(PRODUCT)).toEqual({ min: '150.00', hasRange: true });
    expect(priceSummary({ variants: [{ id: 'a', price: '5.00' }] })).toEqual({
      min: '5.00',
      hasRange: false,
    });
    expect(priceSummary({ variants: [] })).toEqual({ min: null, hasRange: false });
  });

  it('quantityLimit: уникальный — 1, maxPerPurchase, иначе предел интерфейса', () => {
    expect(quantityLimit({ isUnique: true, maxPerPurchase: 9 })).toBe(1);
    expect(quantityLimit({ isUnique: false, maxPerPurchase: 3 })).toBe(3);
    expect(quantityLimit({ isUnique: false, maxPerPurchase: null })).toBe(99);
  });

  it('в коде витрины нет хардкода цен и blur-эффектов', () => {
    const files = [
      'page.tsx',
      '[slug]/page.tsx',
      '_components/product-card.tsx',
      '../../../lib/store/catalog.ts',
    ];
    for (const file of files) {
      const source = readFileSync(join(__dirname, file), 'utf8');
      expect(source, file).not.toMatch(/backdrop-blur|\bblur-|glass/i);
      expect(source, file).not.toMatch(/['"`]\d+[.,]\d{2}['"`]/);
      expect(source, file).not.toMatch(/₽\s?\d|\d\s?₽/);
    }
  });
});
