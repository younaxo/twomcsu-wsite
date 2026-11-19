import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GiveawayStage } from './giveaway-app';
import {
  GiveawayResults,
  REVEAL_FIRST_MS,
  REVEAL_STEP_MS,
  resolveRevealOrder,
} from './giveaway-results';
import { mockResultsReady } from './results-mock';
import type { PublicResults, ResultsApi, ResultsStreamHandlers } from './results-types';
import { RESULTS_POLL_MS } from './use-live-results';

vi.mock('@/components/shell/site-header', () => ({ SiteHeader: () => null }));
vi.mock('@/components/shell/site-footer', () => ({ SiteFooter: () => null }));
vi.mock('./giveaway-page', () => ({ GiveawayPage: () => <p>обычная страница</p> }));

const idle: PublicResults = {
  test: false,
  state: 'idle',
  snapshotHash: null,
  ticketCount: null,
  revision: 0,
};

function stubMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('reduce'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('итоги: порядок и движение', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stubMotion(false);
  });

  it('показывает победителей по очереди от 10 места к 1', () => {
    render(<GiveawayResults data={mockResultsReady(false)} />);
    expect(screen.queryAllByTestId('winner-row')).toHaveLength(0);
    act(() => {
      vi.advanceTimersByTime(REVEAL_FIRST_MS);
    });
    expect(screen.getAllByTestId('winner-row').map((r) => r.dataset.place)).toEqual(['10']);
    for (let i = 0; i < 9; i++) {
      act(() => {
        vi.advanceTimersByTime(REVEAL_STEP_MS);
      });
    }
    const places = screen.getAllByTestId('winner-row').map((r) => Number(r.dataset.place));
    expect(places).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    expect(screen.getByTestId('fair-order')).toBeInTheDocument();
  });

  it('порядок показа: от последнего места к первому', () => {
    const data = mockResultsReady(false);
    expect(
      resolveRevealOrder({ winners: data.winners.slice(0, 3), revealOrder: undefined }),
    ).toEqual([3, 2, 1]);
    expect(resolveRevealOrder({ winners: data.winners, revealOrder: [1, 2] })).toEqual([
      10, 9, 8, 7, 6, 5, 4, 3, 2, 1,
    ]);
  });

  it('метка ТЕСТ для тестовых итогов', () => {
    render(<GiveawayResults data={mockResultsReady(true)} />);
    expect(screen.getByTestId('test-badge')).toHaveTextContent('ТЕСТ');
  });
});

describe('итоги: reduced-motion', () => {
  it('показывает всех сразу и блок честности', () => {
    stubMotion(true);
    render(<GiveawayResults data={mockResultsReady(false)} />);
    expect(screen.getAllByTestId('winner-row')).toHaveLength(10);
    expect(screen.getByText('Проверка честности')).toBeInTheDocument();
  });
});

describe('публичная страница: переключение в итоги', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stubMotion(true);
  });

  const selected = (results: ResultsApi) =>
    ({ api: {}, autoIssue: false, mock: null, results, mode: 'live' }) as never;

  it('по сигналу SSE', async () => {
    let current: PublicResults = idle;
    let handlers!: ResultsStreamHandlers;
    const results: ResultsApi = {
      getResults: vi.fn(async () => current),
      openStream: (_m, h) => {
        handlers = h;
        return { close: vi.fn() };
      },
    };
    render(<GiveawayStage selected={selected(results)} layout="default" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText('обычная страница')).toBeInTheDocument();
    current = mockResultsReady(false);
    await act(async () => {
      handlers.onSignal();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole('heading', { name: 'Итоги розыгрыша' })).toBeInTheDocument();
  });

  it('по опросу раз в 5 с, если поток недоступен', async () => {
    let current: PublicResults = idle;
    const results: ResultsApi = { getResults: vi.fn(async () => current), openStream: () => null };
    render(<GiveawayStage selected={selected(results)} layout="default" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(RESULTS_POLL_MS).toBe(5000);
    current = mockResultsReady(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(screen.getByText('обычная страница')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(screen.getByRole('heading', { name: 'Итоги розыгрыша' })).toBeInTheDocument();
  });
});
