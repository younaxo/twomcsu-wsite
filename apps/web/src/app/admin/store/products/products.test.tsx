import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ApiError } from '@/lib/api/errors';
import AdminStoreProductsPage from './page';

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
    can: (requirement: string | string[]) =>
      (Array.isArray(requirement) ? requirement : [requirement]).some((key) =>
        mocks.granted.has(key),
      ),
  }),
}));
vi.mock('@/components/ui/toast', () => ({ toast: mocks.toast }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/store/products',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const CATEGORY = {
  id: 'c1',
  name: 'Привилегии',
  slug: 'privileges',
  description: null,
  icon: null,
  image: null,
  order: 0,
  isActive: true,
  parentId: null,
};

const PRODUCT = {
  id: 'p1',
  name: 'VIP',
  slug: 'vip',
  description: 'Короткое описание',
  fullDescription: null,
  type: 'PRIVILEGE',
  image: 'https://cdn-files.twomc.su/shop/vip.png',
  images: [],
  categoryId: 'c1',
  category: { id: 'c1', name: 'Привилегии', slug: 'privileges' },
  isGiftable: true,
  isSelfOnly: false,
  isUnique: false,
  isSeasonalOnly: false,
  isFeatured: false,
  maxPerPurchase: null,
  currencyType: null,
  currencyAmount: null,
  server: null,
  isActive: false,
  order: 0,
  variants: [
    { id: 'v1', duration: 'FOREVER', price: '499.00', oldPrice: null, isActive: true, order: 0 },
  ],
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

function grantAll() {
  for (const key of [
    'store.products.view',
    'store.products.create',
    'store.products.edit',
    'store.products.delete',
    'store.products.variants',
    'store.categories.view',
  ]) {
    mocks.granted.add(key);
  }
}

beforeEach(() => {
  mocks.granted.clear();
  for (const fn of [mocks.get, mocks.post, mocks.patch, mocks.delete]) fn.mockReset();
  for (const fn of Object.values(mocks.toast)) fn.mockReset();
  mocks.post.mockResolvedValue(PRODUCT);
  mocks.patch.mockResolvedValue(PRODUCT);
  mocks.delete.mockResolvedValue({ success: true, mode: 'deleted' });
  mocks.get.mockImplementation(async (path: string) => {
    if (path === '/admin/store/products') {
      return { items: [PRODUCT], total: 1, page: 1, limit: 30 };
    }
    if (path === '/admin/store/categories') return [CATEGORY];
    return [];
  });
});

async function openCreate() {
  const user = userEvent.setup();
  render(<AdminStoreProductsPage />, { wrapper: Providers });
  await screen.findByTestId('admin-products');
  await user.click(screen.getByRole('button', { name: 'Новый товар' }));
  const dialog = await screen.findByRole('dialog');
  return { user, dialog };
}

describe('Админка магазина: товары (0.3)', () => {
  it('без права просмотра — экран 403, запросов нет', () => {
    render(<AdminStoreProductsPage />, { wrapper: Providers });
    expect(screen.queryByTestId('admin-products')).toBeNull();
    expect(screen.getByText(/store\.products\.view/)).toBeInTheDocument();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('только просмотр: список без кнопок создания, удаления и активации', async () => {
    mocks.granted.add('store.products.view');
    render(<AdminStoreProductsPage />, { wrapper: Providers });
    const list = await screen.findByTestId('admin-products');
    expect(within(list).getByText('VIP')).toBeInTheDocument();
    expect(within(list).getByText('Неактивен')).toBeInTheDocument();
    expect(list).toHaveTextContent('Привилегии');
    expect(screen.queryByRole('button', { name: 'Новый товар' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Удалить' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Активировать' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Открыть' })).toBeInTheDocument();
  });

  it('403 списка с 2FA — понятное сообщение со ссылкой «Включить 2FA»', async () => {
    mocks.granted.add('store.products.view');
    mocks.get.mockRejectedValue(
      new ApiError(403, ['Требуется 2FA'], { code: 'admin_2fa_required' }),
    );
    render(<AdminStoreProductsPage />, { wrapper: Providers });
    expect(await screen.findByText('Нужна двухфакторная аутентификация')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Включить 2FA' })).toBeInTheDocument();
  });

  it('создание: валидация цены, slug и хоста картинки, ошибки у полей, запроса нет', async () => {
    grantAll();
    const { user, dialog } = await openCreate();
    await user.type(within(dialog).getByLabelText(/Название/), 'Алмазный ключ');
    await user.type(within(dialog).getByLabelText(/Slug/), 'Bad Slug');
    await user.type(within(dialog).getByLabelText('Картинка (URL)'), 'http://evil.example/a.png');
    await user.type(within(dialog).getByLabelText(/Цена, ₽/), '12.345');
    await user.click(within(dialog).getByRole('button', { name: 'Создать товар' }));

    expect(
      within(dialog).getByText('Только строчные латинские буквы, цифры и дефис'),
    ).toBeVisible();
    expect(within(dialog).getByText(/Только https-ссылка на хост/)).toBeVisible();
    expect(within(dialog).getByText(/Цена — число, до 2 знаков/)).toBeVisible();
    expect(within(dialog).getByLabelText('Картинка (URL)')).toHaveAttribute('aria-invalid', 'true');
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('создание: POST без isActive/gameCommands, цена строкой, поле «выдача» не показано', async () => {
    grantAll();
    const { user, dialog } = await openCreate();
    expect(within(dialog).getByText(/настраивается владельцем в подэтапе 0\.11/)).toBeVisible();
    expect(within(dialog).queryByLabelText(/команд/i)).toBeNull();
    await user.type(within(dialog).getByLabelText(/Название/), 'Алмазный ключ');
    await user.type(within(dialog).getByLabelText(/Slug/), 'diamond-key');
    await user.type(within(dialog).getByLabelText(/Цена, ₽/), '199.50');
    await user.click(within(dialog).getByRole('button', { name: 'Создать товар' }));

    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    const [path, body] = mocks.post.mock.calls[0]!;
    expect(path).toBe('/admin/store/products');
    expect(body).toMatchObject({
      name: 'Алмазный ключ',
      slug: 'diamond-key',
      type: 'PRIVILEGE',
      categoryId: 'c1',
      variants: [{ duration: 'FOREVER', price: '199.50', order: 0 }],
    });
    expect(body).not.toHaveProperty('isActive');
    expect(body).not.toHaveProperty('gameCommands');
    expect(typeof body.variants[0].price).toBe('string');
    expect(mocks.toast.success).toHaveBeenCalled();
  });

  it('предпросмотр карточки показывает название и цену «как на витрине»', async () => {
    grantAll();
    const { user, dialog } = await openCreate();
    await user.type(within(dialog).getByLabelText(/Название/), 'Алмазный ключ');
    await user.type(within(dialog).getByLabelText(/Цена, ₽/), '250');
    const preview = within(dialog).getByTestId('product-preview');
    expect(within(preview).getByText('Алмазный ключ')).toBeInTheDocument();
    expect(preview).toHaveTextContent(/250/);
    expect(preview).toHaveAttribute('inert');
  });

  it('предпросмотр полного описания: Markdown безопасно, без сырого HTML', async () => {
    grantAll();
    const { user, dialog } = await openCreate();
    await user.click(within(dialog).getByLabelText(/Полное описание/));
    await user.paste('**Жирно** <script>alert(1)</script>');
    const block = within(dialog).getByTestId('full-description-preview');
    expect(block.querySelector('strong')).toHaveTextContent('Жирно');
    expect(block.querySelector('script')).toBeNull();
  });

  it('409 по slug — ошибка у поля slug; 400 по картинке — ошибка у поля картинки', async () => {
    grantAll();
    mocks.post.mockRejectedValueOnce(new ApiError(409, ['Товар с таким slug уже существует']));
    const { user, dialog } = await openCreate();
    await user.type(within(dialog).getByLabelText(/Название/), 'Ключ');
    await user.type(within(dialog).getByLabelText(/Slug/), 'key');
    await user.type(within(dialog).getByLabelText(/Цена, ₽/), '10');
    await user.click(within(dialog).getByRole('button', { name: 'Создать товар' }));
    expect(await within(dialog).findByText('Товар с таким slug уже существует')).toBeVisible();
    expect(within(dialog).getByLabelText(/Slug/)).toHaveAttribute('aria-invalid', 'true');
  });

  it('создание: 2FA и 403 при отправке — сообщение в форме, диалог остаётся', async () => {
    grantAll();
    mocks.post.mockRejectedValueOnce(
      new ApiError(403, ['Требуется 2FA'], { code: 'admin_2fa_required' }),
    );
    const { user, dialog } = await openCreate();
    await user.type(within(dialog).getByLabelText(/Название/), 'Ключ');
    await user.type(within(dialog).getByLabelText(/Slug/), 'key');
    await user.type(within(dialog).getByLabelText(/Цена, ₽/), '10');
    await user.click(within(dialog).getByRole('button', { name: 'Создать товар' }));
    const alert = await within(dialog).findByTestId('product-form-error');
    expect(alert).toHaveTextContent(/двухфакторная/);
    expect(within(alert).getByRole('link', { name: 'Включить 2FA' })).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('активация: 422 PRODUCT_TYPE_NOT_SELLABLE — понятная ошибка в toast', async () => {
    grantAll();
    mocks.patch.mockRejectedValueOnce(
      new ApiError(422, ['нельзя активировать'], { code: 'PRODUCT_TYPE_NOT_SELLABLE' }),
    );
    const user = userEvent.setup();
    render(<AdminStoreProductsPage />, { wrapper: Providers });
    await screen.findByTestId('admin-products');
    await user.click(screen.getByRole('button', { name: 'Активировать' }));
    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith(expect.stringMatching(/не входит в список/)),
    );
    expect(mocks.patch).toHaveBeenCalledWith('/admin/store/products/p1', { isActive: true });
  });

  it('правка: PATCH только изменённых полей; очистка картинки блокируется на клиенте', async () => {
    grantAll();
    const user = userEvent.setup();
    render(<AdminStoreProductsPage />, { wrapper: Providers });
    await screen.findByTestId('admin-products');
    await user.click(screen.getByRole('button', { name: 'Изменить' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/Slug/)).toBeDisabled();

    await user.clear(within(dialog).getByLabelText('Картинка (URL)'));
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить товар' }));
    expect(within(dialog).getByText(/Очистить картинку пока нельзя/)).toBeVisible();
    expect(mocks.patch).not.toHaveBeenCalled();

    await user.type(
      within(dialog).getByLabelText('Картинка (URL)'),
      'https://cdn-files.twomc.su/shop/vip.png',
    );
    const order = within(dialog).getByLabelText('Порядок на витрине');
    await user.clear(order);
    await user.type(order, '5');
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить товар' }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledTimes(1));
    expect(mocks.patch).toHaveBeenCalledWith('/admin/store/products/p1', { order: 5 });
  });

  it('вариант: PATCH цены Decimal-строкой; удаление варианта из набора — 409 VARIANT_IN_BUNDLE', async () => {
    grantAll();
    const user = userEvent.setup();
    render(<AdminStoreProductsPage />, { wrapper: Providers });
    await screen.findByTestId('admin-products');
    await user.click(screen.getByRole('button', { name: 'Изменить' }));
    const dialog = await screen.findByRole('dialog');
    const row = within(dialog).getByTestId('variant-row');
    const price = within(row).getByLabelText(/Цена, ₽/);
    await user.clear(price);
    await user.type(price, '599.00');
    await user.click(within(row).getByRole('button', { name: 'Сохранить вариант' }));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith('/admin/store/products/p1/variants/v1', {
        price: '599.00',
      }),
    );

    mocks.delete.mockRejectedValueOnce(
      new ApiError(409, ['в наборе'], { code: 'VARIANT_IN_BUNDLE' }),
    );
    await user.click(within(row).getByRole('button', { name: 'Удалить' }));
    const confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: 'Удалить' }));
    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith(expect.stringMatching(/входит в набор/)),
    );
  });

  it('удаление: мягкое при заказах — сообщение о деактивации; 409 PRODUCT_IN_BUNDLE — об отказе', async () => {
    grantAll();
    const user = userEvent.setup();
    mocks.delete.mockResolvedValueOnce({ success: true, mode: 'deactivated' });
    render(<AdminStoreProductsPage />, { wrapper: Providers });
    await screen.findByTestId('admin-products');
    await user.click(screen.getByRole('button', { name: 'Удалить' }));
    let confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: 'Удалить' }));
    await waitFor(() =>
      expect(mocks.toast.success).toHaveBeenCalledWith(expect.stringMatching(/деактивирован/)),
    );
    expect(mocks.delete).toHaveBeenCalledWith('/admin/store/products/p1');

    mocks.delete.mockRejectedValueOnce(
      new ApiError(409, ['в наборе'], { code: 'PRODUCT_IN_BUNDLE' }),
    );
    await user.click(screen.getByRole('button', { name: 'Удалить' }));
    confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: 'Удалить' }));
    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith(expect.stringMatching(/входит в набор/)),
    );
  });

  it('создание: пустая форма — фокус на первом невалидном поле, ровно один role=alert', async () => {
    grantAll();
    const { user, dialog } = await openCreate();
    await user.click(within(dialog).getByRole('button', { name: 'Создать товар' }));
    const name = within(dialog).getByLabelText(/Название/);
    await waitFor(() => expect(name).toHaveFocus());
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name.getAttribute('aria-describedby')).toContain('-error');
    const alerts = within(dialog).getAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveAttribute('data-testid', 'product-form-error');
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('создание: ошибка только в варианте — фокус на цене варианта, один alert', async () => {
    grantAll();
    const { user, dialog } = await openCreate();
    await user.type(within(dialog).getByLabelText(/Название/), 'Ключ');
    await user.type(within(dialog).getByLabelText(/Slug/), 'key');
    await user.click(within(dialog).getByRole('button', { name: 'Создать товар' }));
    const price = within(within(dialog).getByTestId('variant-drafts')).getByLabelText(/Цена, ₽/);
    await waitFor(() => expect(price).toHaveFocus());
    expect(price).toHaveAttribute('aria-invalid', 'true');
    expect(within(dialog).getAllByRole('alert')).toHaveLength(1);
  });

  it('вариант (правка): неверная цена — фокус на поле, один alert в строке', async () => {
    grantAll();
    const user = userEvent.setup();
    render(<AdminStoreProductsPage />, { wrapper: Providers });
    await screen.findByTestId('admin-products');
    await user.click(screen.getByRole('button', { name: 'Изменить' }));
    const dialog = await screen.findByRole('dialog');
    const row = within(dialog).getByTestId('variant-row');
    const price = within(row).getByLabelText(/Цена, ₽/);
    await user.clear(price);
    await user.type(price, 'abc');
    await user.click(within(row).getByRole('button', { name: 'Сохранить вариант' }));
    await waitFor(() => expect(price).toHaveFocus());
    expect(price).toHaveAttribute('aria-invalid', 'true');
    expect(within(row).getAllByRole('alert')).toHaveLength(1);
    expect(mocks.patch).not.toHaveBeenCalled();
  });

  it('новый вариант (правка): пустая цена — фокус на цене, один alert', async () => {
    grantAll();
    const user = userEvent.setup();
    render(<AdminStoreProductsPage />, { wrapper: Providers });
    await screen.findByTestId('admin-products');
    await user.click(screen.getByRole('button', { name: 'Изменить' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Добавить вариант' }));
    const group = within(dialog).getByRole('group', { name: 'Новый вариант' });
    await user.click(within(group).getByRole('button', { name: 'Добавить' }));
    const price = within(group).getByLabelText(/Цена, ₽/);
    await waitFor(() => expect(price).toHaveFocus());
    expect(within(group).getAllByRole('alert')).toHaveLength(1);
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('400 сервера по картинке: фокус на поле, сводка одна', async () => {
    grantAll();
    mocks.post.mockRejectedValueOnce(
      new ApiError(400, ['Картинка — https-ссылка на один из хостов: cdn-files.twomc.su']),
    );
    const { user, dialog } = await openCreate();
    await user.type(within(dialog).getByLabelText(/Название/), 'Ключ');
    await user.type(within(dialog).getByLabelText(/Slug/), 'key');
    await user.type(within(dialog).getByLabelText(/Цена, ₽/), '10');
    await user.click(within(dialog).getByRole('button', { name: 'Создать товар' }));
    const image = within(dialog).getByLabelText('Картинка (URL)');
    await waitFor(() => expect(image).toHaveFocus());
    expect(within(dialog).getAllByRole('alert')).toHaveLength(1);
  });

  it('поиск уходит в API параметром search', async () => {
    mocks.granted.add('store.products.view');
    const user = userEvent.setup();
    render(<AdminStoreProductsPage />, { wrapper: Providers });
    await screen.findByTestId('admin-products');
    await user.type(screen.getByLabelText('Поиск по названию'), 'vip');
    await user.click(screen.getByRole('button', { name: 'Найти' }));
    await waitFor(() =>
      expect(mocks.get).toHaveBeenCalledWith(
        '/admin/store/products',
        expect.objectContaining({ query: expect.objectContaining({ search: 'vip', page: 1 }) }),
      ),
    );
  });
});
