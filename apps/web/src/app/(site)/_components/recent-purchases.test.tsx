import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFetchMock, jsonResponse, type FetchMock } from '@/test/http';
import { HomeRecentPurchases } from './recent-purchases';

function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

let fetchMock: FetchMock;

beforeEach(() => {
  fetchMock = installFetchMock();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HomeRecentPurchases', () => {
  it('ошибка 503: честное сообщение с «Повторить», а не «покупок не было»', async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 503 }));
    render(<HomeRecentPurchases />, { wrapper: Providers });
    const error = await screen.findByTestId('recent-purchases-error');
    expect(error).toHaveTextContent('Лента покупок сейчас недоступна');
    expect(screen.queryByTestId('recent-purchases-empty')).toBeNull();

    fetchMock.mockImplementation(async () => jsonResponse([]));
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    await waitFor(() => expect(screen.getByTestId('recent-purchases-empty')).toBeInTheDocument());
  });

  it('пустой ответ: пустое состояние без ошибки', async () => {
    fetchMock.mockImplementation(async () => jsonResponse([]));
    render(<HomeRecentPurchases />, { wrapper: Providers });
    expect(await screen.findByTestId('recent-purchases-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('recent-purchases-error')).toBeNull();
  });
});
