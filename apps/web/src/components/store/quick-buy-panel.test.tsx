import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import { QuickBuyPanel } from './quick-buy-panel';

const mocks = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }));

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get, post: mocks.post },
}));

const CONFIG = { offerVersion: 'v1', paymentAvailable: true, quickBuyEnabled: true };
const TOKEN = 'TOKEN_abcdefghijklmnopqrstuvwxyz0123456789';

function setup(config = CONFIG) {
  mocks.get.mockResolvedValue(config);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <QuickBuyPanel variantId="v1" quantity={2} productName="Товар" />
    </QueryClientProvider>,
  );
}

async function fill(nick: string, accept = true) {
  await screen.findByTestId('quick-buy-form');
  await userEvent.type(screen.getByTestId('quick-buy-nick'), nick);
  if (accept) await userEvent.click(screen.getByTestId('quick-buy-offer'));
}

const submit = () => userEvent.click(screen.getByTestId('quick-buy-submit'));

beforeEach(() => {
  mocks.post.mockReset();
  mocks.get.mockReset();
});

describe('QuickBuyPanel', () => {
  it('не отправляет запрос с неверным ником', async () => {
    setup();
    await fill('ab');
    await waitFor(() => expect(screen.getByTestId('quick-buy-submit')).toBeEnabled());
    await submit();
    expect(screen.getByTestId('quick-buy-nick-error')).toHaveTextContent('от 3 до 16');
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('требует оферту', async () => {
    setup();
    await fill('Steve', false);
    await waitFor(() => expect(screen.getByTestId('quick-buy-submit')).toBeEnabled());
    await submit();
    expect(screen.getByTestId('quick-buy-offer-error')).toHaveTextContent('согласие с офертой');
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it.each([
    ['nick_unavailable', 400, 'Покупка для этого ника недоступна'],
    [undefined, 429, 'Слишком много попыток, попробуйте через минуту'],
    ['login_required', 403, 'Войдите, чтобы купить этот товар'],
  ] as const)('ошибка %s / %s', async (code, status, text) => {
    mocks.post.mockRejectedValue(new ApiError(status, ['x'], code ? { code } : undefined));
    setup();
    await fill('Steve');
    await waitFor(() => expect(screen.getByTestId('quick-buy-submit')).toBeEnabled());
    await submit();
    await waitFor(() => expect(screen.getByText(text)).toBeInTheDocument());
  });

  it('paid_removal_unavailable превращает панель в «Скоро»', async () => {
    mocks.post.mockRejectedValue(new ApiError(503, ['x'], { code: 'paid_removal_unavailable' }));
    setup();
    await fill('Steve');
    await waitFor(() => expect(screen.getByTestId('quick-buy-submit')).toBeEnabled());
    await submit();
    const soon = await screen.findByTestId('quick-buy-soon');
    expect(soon).toHaveTextContent('Скоро');
    expect(soon).toHaveTextContent('Снятие наказаний временно недоступно');
    expect(soon).toHaveClass('cursor-not-allowed');
    expect(screen.queryByTestId('quick-buy-submit')).not.toBeInTheDocument();
  });

  it('quick_buy выключен — понятное сообщение без формы', async () => {
    setup({ ...CONFIG, quickBuyEnabled: false });
    expect(await screen.findByTestId('quick-buy-disabled')).toHaveTextContent('недоступна');
    expect(screen.queryByTestId('quick-buy-form')).not.toBeInTheDocument();
  });

  it('показывает ссылку с токеном во фрагменте один раз', async () => {
    mocks.post.mockResolvedValue({
      order: { orderNumber: 'TW-1', total: '200.00', status: 'PENDING' },
      paymentUrl: null,
      guestAccessToken: TOKEN,
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    setup();
    await fill('Steve');
    await waitFor(() => expect(screen.getByTestId('quick-buy-submit')).toBeEnabled());
    await submit();

    const [path, body, options] = mocks.post.mock.calls[0];
    expect(path).toBe('/store/quick-buy');
    expect(path).not.toContain(TOKEN);
    expect(body).toEqual({
      variantId: 'v1',
      quantity: 2,
      guestMinecraftNick: 'Steve',
      offerVersion: 'v1',
    });
    expect(options).toMatchObject({ auth: false });

    const link = (await screen.findByTestId('quick-buy-link')) as HTMLInputElement;
    expect(link.value).toContain(`/shop/order/guest#t=${TOKEN}`);
    expect(link.value).not.toContain('?');
    expect(screen.getByText(/30 дней/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Скопировать/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(link.value));

    await userEvent.click(screen.getByTestId('quick-buy-dismiss'));
    expect(screen.queryByTestId('quick-buy-link')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain(TOKEN);
    expect(JSON.stringify({ ...localStorage })).not.toContain(TOKEN);
    expect(JSON.stringify({ ...sessionStorage })).not.toContain(TOKEN);
  });
});
