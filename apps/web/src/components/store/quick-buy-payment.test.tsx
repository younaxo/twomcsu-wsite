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
const SBP = { code: 'SBP', title: 'СБП', currency: 'RUB' };
const CARD = { code: 'CARD_RU', title: 'Карта РФ', currency: 'RUB' };
const CREATED = {
  order: { orderNumber: 'TW-1', total: '100.00', status: 'PENDING' },
  paymentUrl: null,
};

function setup(methods: () => unknown) {
  mocks.get.mockImplementation((path: string) =>
    path === '/store/payment-methods' ? methods() : Promise.resolve(CONFIG),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <QuickBuyPanel variantId="v1" quantity={2} productName="Товар" />
    </QueryClientProvider>,
  );
}

async function fill() {
  await screen.findByTestId('quick-buy-form');
  await userEvent.type(screen.getByTestId('quick-buy-nick'), 'Steve');
  await userEvent.click(screen.getByTestId('quick-buy-offer'));
  await waitFor(() => expect(screen.getByTestId('quick-buy-submit')).toBeEnabled());
}

beforeEach(() => {
  mocks.post.mockReset();
  mocks.get.mockReset();
});

describe('QuickBuyPanel: способ оплаты', () => {
  it('требует выбор и отправляет код', async () => {
    mocks.post.mockResolvedValue(CREATED);
    setup(() => Promise.resolve({ methods: [SBP, CARD] }));
    await screen.findByRole('radiogroup');
    await fill();
    await userEvent.click(screen.getByTestId('quick-buy-submit'));
    expect(screen.getByTestId('quick-buy-payment-methods-validation')).toHaveTextContent(
      'Выберите способ оплаты',
    );
    expect(mocks.post).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(screen.getAllByRole('radio')[0]));
    await userEvent.click(screen.getByRole('radio', { name: /Карта РФ/ }));
    await userEvent.click(screen.getByTestId('quick-buy-submit'));
    await waitFor(() => expect(mocks.post).toHaveBeenCalled());
    expect(mocks.post.mock.calls[0][1]).toMatchObject({ paymentMethod: 'CARD_RU' });
  });

  it('пустой список: выбора нет, paymentMethod не уходит', async () => {
    mocks.post.mockResolvedValue(CREATED);
    setup(() => Promise.resolve({ methods: [] }));
    await fill();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId('quick-buy-submit'));
    await waitFor(() => expect(mocks.post).toHaveBeenCalled());
    expect(mocks.post.mock.calls[0][1]).not.toHaveProperty('paymentMethod');
  });

  it('400 payment_method_unavailable: текст, перезагрузка списка', async () => {
    let list = [SBP, CARD];
    mocks.post.mockRejectedValue(
      new ApiError(400, ['raw'], { code: 'payment_method_unavailable' }),
    );
    setup(() => Promise.resolve({ methods: list }));
    await screen.findByRole('radiogroup');
    await fill();
    await userEvent.click(screen.getByRole('radio', { name: /СБП/ }));
    list = [CARD, { code: 'CRYPTO', title: 'Крипто', currency: 'USDT' }];
    await userEvent.click(screen.getByTestId('quick-buy-submit'));
    expect(await screen.findByTestId('quick-buy-payment-methods-validation')).toHaveTextContent(
      'сейчас недоступен',
    );
    await waitFor(() => expect(screen.queryByRole('radio', { name: /СБП/ })).toBeNull());
    expect(screen.getByTestId('quick-buy-error')).not.toHaveTextContent('raw');
  });

  it('503 payment_unavailable: безопасный текст', async () => {
    mocks.post.mockRejectedValue(new ApiError(503, ['x'], { code: 'payment_unavailable' }));
    setup(() => Promise.resolve({ methods: [SBP] }));
    await fill();
    await userEvent.click(screen.getByTestId('quick-buy-submit'));
    expect(await screen.findByText(/Оплата временно недоступна/)).toBeInTheDocument();
  });
});
