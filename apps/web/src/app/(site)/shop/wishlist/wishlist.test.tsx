import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import { useAuthStore } from '@/lib/auth/store';
import WishlistPage from './page';

const mocks = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn(), delete: vi.fn() }));

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get, patch: mocks.patch, delete: mocks.delete },
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/shop/wishlist',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/lib/site/status', () => ({
  useModuleAvailability: () => ({ reason: null, bypass: false, maintenance: null }),
}));

const product = (n: number) => ({
  id: `p${n}`,
  name: `Товар ${n}`,
  slug: `item-${n}`,
  description: null,
  image: null,
  variants: [{ id: `v${n}`, price: '100.00', isActive: true }],
});
const wishlist = (items: number[], isPublic = false) => ({
  id: 'w1',
  isPublic,
  items: items.map((n) => ({ id: `i${n}`, productId: `p${n}`, product: product(n) })),
});

function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mocks.get.mockReset();
  mocks.patch.mockReset();
  mocks.delete.mockReset();
  useAuthStore.setState({ status: 'authenticated', user: { id: 'u1', username: 'p' } as never });
});

describe('/shop/wishlist', () => {
  it('гость: приглашение войти с next и без запроса', () => {
    useAuthStore.setState({ status: 'anonymous', user: null });
    render(<WishlistPage />, { wrapper: Providers });
    expect(screen.getByRole('link', { name: 'Войти' })).toHaveAttribute(
      'href',
      '/login?next=%2Fshop%2Fwishlist',
    );
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('загрузка, затем список со ссылками на товары', async () => {
    mocks.get.mockResolvedValue(wishlist([1, 2]));
    render(<WishlistPage />, { wrapper: Providers });
    expect(screen.getByTestId('wishlist-skeleton')).toBeInTheDocument();
    const rows = await screen.findAllByTestId('wishlist-row');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByRole('link', { name: 'Товар 1' })).toHaveAttribute(
      'href',
      '/shop/item-1',
    );
    expect(mocks.get).toHaveBeenCalledWith('/store/wishlist');
  });

  it('пусто: честное состояние со ссылкой в магазин', async () => {
    mocks.get.mockResolvedValue(wishlist([]));
    render(<WishlistPage />, { wrapper: Providers });
    expect(await screen.findByText('Избранное пусто')).toBeVisible();
    expect(screen.getByRole('link', { name: 'В магазин' })).toHaveAttribute('href', '/shop');
  });

  it('ошибка: сообщение и повтор', async () => {
    mocks.get.mockRejectedValue(new ApiError(500, ['Сбой']));
    render(<WishlistPage />, { wrapper: Providers });
    expect(await screen.findByRole('button', { name: /Повторить/ })).toBeVisible();
  });

  it('удаление вызывает DELETE и обновляет список', async () => {
    const user = userEvent.setup();
    mocks.get.mockResolvedValue(wishlist([1, 2]));
    mocks.delete.mockResolvedValue(wishlist([2]));
    render(<WishlistPage />, { wrapper: Providers });
    await user.click(await screen.findByRole('button', { name: 'Убрать из избранного: Товар 1' }));
    await waitFor(() => expect(screen.getAllByTestId('wishlist-row')).toHaveLength(1));
    expect(mocks.delete).toHaveBeenCalledWith('/store/wishlist/items/p1');
  });

  it('переключатель публичности отправляет PATCH', async () => {
    const user = userEvent.setup();
    mocks.get.mockResolvedValue(wishlist([1]));
    mocks.patch.mockResolvedValue(wishlist([1], true));
    render(<WishlistPage />, { wrapper: Providers });
    await user.click(await screen.findByRole('switch'));
    expect(mocks.patch).toHaveBeenCalledWith('/store/wishlist', { isPublic: true });
  });
});
