import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from '@/components/ui/toast';
import { createHttpGiveawayApi } from './api';
import { GiveawayPage } from './giveaway-page';
import { POLL_INTERVAL_MS } from './use-giveaway';
import {
  GiveawayApiError,
  type GiveawayApi,
  type GiveawayCodeStatus,
  type GiveawayPhase,
  type GiveawayPublicInfo,
} from './types';

vi.mock('@/components/ui/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

const HOUR = 3_600_000;
const NOW = Date.parse('2026-11-20T12:00:00.000Z');

function info(status: GiveawayPhase): GiveawayPublicInfo {
  const start = status === 'before' ? NOW + 26 * HOUR : NOW - 48 * HOUR;
  const cutoff = status === 'finished' ? NOW - HOUR : NOW + 900 * HOUR;
  return {
    status,
    thresholdMinutes: 3000,
    thresholdHours: 50,
    startAtUtc: new Date(start).toISOString(),
    cutoffAtUtc: new Date(cutoff).toISOString(),
    startAtMsk: '',
    cutoffAtMsk: '',
    ticketsIssued: 7,
  };
}

function makeApi(over: Partial<GiveawayApi> & { phase?: GiveawayPhase } = {}): GiveawayApi {
  const { phase, ...methods } = over;
  return {
    getPublic: vi.fn(async () => info(phase ?? 'running')),
    issueCode: vi.fn(async () => ({
      code: 'ABCD-EFGH-JKMN-PQRS',
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      ttlSeconds: 600,
    })),
    getStatus: vi.fn(async (): Promise<GiveawayCodeStatus> => ({ status: 'none' })),
    ...methods,
  };
}

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function setReducedMotion(reduced: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduced && query.includes('reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

const pendingStatus = (): GiveawayCodeStatus => ({
  status: 'pending',
  expiresAt: new Date(Date.now() + 500_000).toISOString(),
});

describe('страница розыгрыша', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
    setReducedMotion(false);
    setVisibility('visible');
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('до старта: обратный отсчёт и дата по МСК', async () => {
    render(<GiveawayPage api={makeApi({ phase: 'before' })} />);
    await flush();
    expect(screen.getByText('Розыгрыш скоро начнётся')).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveAccessibleName(/1 день 2 часа 0 минут/);
    expect(screen.getAllByText(/по МСК/).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Получить код' })).toBeNull();
  });

  it('идёт розыгрыш: кнопка «Получить код» и подсказка про время', async () => {
    render(<GiveawayPage api={makeApi()} />);
    await flush();
    expect(screen.getByText('Розыгрыш идёт')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Получить код' })).toBeInTheDocument();
    expect(screen.getByText(/игра покажет, сколько осталось/)).toBeInTheDocument();
  });

  it('выдаёт код, показывает инструкцию, таймер и копирует код', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<GiveawayPage api={makeApi()} />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Получить код' }));
    await advance(10);
    expect(screen.getByTestId('giveaway-code')).toHaveTextContent('ABCD-EFGH-JKMN-PQRS');
    expect(screen.getByText(/\/giveaway ABCD-EFGH-JKMN-PQRS/)).toBeInTheDocument();
    expect(screen.getByTestId('code-timer')).toHaveTextContent('10:00');
    expect(screen.getByRole('button', { name: 'Новый код' })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Скопировать' }));
    });
    expect(writeText).toHaveBeenCalledWith('ABCD-EFGH-JKMN-PQRS');
    expect(screen.getByRole('button', { name: 'Скопировано' })).toBeInTheDocument();
  });

  it('опрашивает статус и показывает билет с ником после ввода кода', async () => {
    let calls = 0;
    const api = makeApi({
      getStatus: vi.fn(async (): Promise<GiveawayCodeStatus> => {
        calls += 1;
        if (calls === 1) return { status: 'none' };
        if (calls === 2) return pendingStatus();
        return { status: 'redeemed', ticket: 'K417', playerName: 'Steve' };
      }),
    });
    setReducedMotion(true);
    render(<GiveawayPage api={api} />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Получить код' }));
    await advance(10);
    await advance(POLL_INTERVAL_MS);
    await advance(POLL_INTERVAL_MS);
    expect(screen.getByText('Вы в розыгрыше!')).toBeInTheDocument();
    expect(screen.getByText('Steve')).toBeInTheDocument();
    expect(screen.getAllByTestId('ticket-char').map((n) => n.textContent)).toEqual([
      'K',
      '4',
      '1',
      '7',
    ]);
  });

  it('опрос не идёт в скрытой вкладке и возобновляется при возврате', async () => {
    const api = makeApi({
      getStatus: vi.fn(async () => pendingStatus()).mockResolvedValueOnce({ status: 'none' }),
    });
    render(<GiveawayPage api={api} />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Получить код' }));
    await advance(10);
    setVisibility('hidden');
    const before = vi.mocked(api.getStatus).mock.calls.length;
    await advance(POLL_INTERVAL_MS * 4);
    expect(vi.mocked(api.getStatus).mock.calls.length).toBe(before);
    setVisibility('visible');
    await flush();
    expect(vi.mocked(api.getStatus).mock.calls.length).toBe(before + 1);
  });

  it('останавливает опрос по истечении кода и предлагает новый', async () => {
    const api = makeApi({
      issueCode: vi.fn(async () => ({
        code: 'ABCD-EFGH-JKMN-PQRS',
        expiresAt: new Date(Date.now() + 5_000).toISOString(),
        ttlSeconds: 5,
      })),
      getStatus: vi.fn(async () => pendingStatus()).mockResolvedValueOnce({ status: 'none' }),
    });
    render(<GiveawayPage api={api} />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Получить код' }));
    await advance(10);
    await advance(6_000);
    expect(screen.getByText('Код истёк')).toBeInTheDocument();
    const calls = vi.mocked(api.getStatus).mock.calls.length;
    await advance(POLL_INTERVAL_MS * 6);
    expect(vi.mocked(api.getStatus).mock.calls.length).toBe(calls);
    expect(screen.getByRole('button', { name: 'Получить код снова' })).toBeInTheDocument();
  });

  it('prefers-reduced-motion: билет сразу, без перебора символов', async () => {
    setReducedMotion(true);
    const api = makeApi({
      getStatus: vi.fn(async (): Promise<GiveawayCodeStatus> => ({
        status: 'redeemed',
        ticket: 'B042',
        playerName: 'Alex',
      })),
    });
    render(<GiveawayPage api={api} />);
    await flush();
    expect(screen.getByText('Ваш билет')).toBeInTheDocument();
    expect(screen.getByTestId('ticket-card')).toHaveAttribute('data-settled', 'true');
    expect(screen.getByText(/Билет уже получен/)).toBeInTheDocument();
  });

  it('анимация: символы сначала крутятся, затем остаются итоговыми', async () => {
    let calls = 0;
    const api = makeApi({
      getStatus: vi.fn(async (): Promise<GiveawayCodeStatus> => {
        calls += 1;
        if (calls === 1) return { status: 'none' };
        return { status: 'redeemed', ticket: 'K417', playerName: 'Steve' };
      }),
    });
    render(<GiveawayPage api={api} />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Получить код' }));
    await advance(10);
    await advance(POLL_INTERVAL_MS);
    expect(screen.getByTestId('ticket-card')).toHaveAttribute('data-settled', 'false');
    await advance(2_000);
    expect(screen.getByTestId('ticket-card')).toHaveAttribute('data-settled', 'true');
    expect(screen.getAllByTestId('ticket-char').map((n) => n.textContent)).toEqual([
      'K',
      '4',
      '1',
      '7',
    ]);
  });

  it('ошибка 429 при выдаче кода: понятный текст', async () => {
    const api = makeApi({
      issueCode: vi.fn(async () => {
        throw new GiveawayApiError('rate_limited', 120);
      }),
    });
    render(<GiveawayPage api={api} />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Получить код' }));
    await advance(10);
    expect(toast.error).toHaveBeenCalledWith(
      'Не удалось получить код',
      expect.objectContaining({
        description: expect.stringMatching(/Слишком много попыток.*2 минуты/),
      }),
    );
  });

  it('ошибка сети при загрузке: сообщение и повтор', async () => {
    const getPublic = vi
      .fn<GiveawayApi['getPublic']>()
      .mockRejectedValueOnce(new GiveawayApiError('network'))
      .mockResolvedValue(info('running'));
    render(<GiveawayPage api={makeApi({ getPublic })} />);
    await flush();
    expect(toast.error).toHaveBeenCalledWith(
      'Не удалось загрузить розыгрыш',
      expect.objectContaining({ description: expect.stringMatching(/Нет связи/) }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    await flush();
    expect(screen.getByText('Розыгрыш идёт')).toBeInTheDocument();
  });

  it('«время не набрано»: показывает наиграно/осталось, код остаётся действующим', async () => {
    const api = makeApi({
      getStatus: vi
        .fn(async (): Promise<GiveawayCodeStatus> => ({
          status: 'pending',
          expiresAt: new Date(Date.now() + 500_000).toISOString(),
          lastAttempt: {
            result: 'not_enough',
            minutes: 1710,
            remainingMinutes: 1290,
            thresholdMinutes: 3000,
          },
        }))
        .mockResolvedValueOnce({ status: 'none' }),
    });
    render(<GiveawayPage api={api} />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Получить код' }));
    await advance(10);
    expect(screen.queryByTestId('not-enough')).toBeNull();
    await advance(POLL_INTERVAL_MS + 10);
    const notice = screen.getByTestId('not-enough');
    expect(notice).toHaveTextContent(
      'Время ещё не набрано: 28 ч 30 мин из 50 ч, осталось 21 ч 30 мин.',
    );
    expect(notice).toHaveTextContent(/Код остаётся действующим/);
    expect(screen.getByTestId('giveaway-code')).toHaveTextContent('ABCD-EFGH-JKMN-PQRS');
    expect(screen.getByTestId('code-timer')).toBeInTheDocument();
    expect(screen.queryByText('Код истёк')).toBeNull();
  });

  it('«время не набрано» при перезагрузке страницы: уведомление есть, кода нет', async () => {
    const api = makeApi({
      getStatus: vi.fn(async (): Promise<GiveawayCodeStatus> => ({
        status: 'pending',
        expiresAt: new Date(Date.now() + 500_000).toISOString(),
        lastAttempt: {
          result: 'not_enough',
          minutes: 45,
          remainingMinutes: 2955,
          thresholdMinutes: 3000,
        },
      })),
    });
    render(<GiveawayPage api={api} />);
    await flush();
    expect(screen.getByTestId('not-enough')).toHaveTextContent(
      '45 мин из 50 ч, осталось 49 ч 15 мин',
    );
    expect(screen.queryByTestId('giveaway-code')).toBeNull();
  });

  it('розыгрыш завершён', async () => {
    render(<GiveawayPage api={makeApi({ phase: 'finished' })} />);
    await flush();
    expect(screen.getByText('Розыгрыш завершён')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Получить код/ })).toBeNull();
  });
});

describe('HTTP-клиент', () => {
  it('ходит на /api/giveaway/v1 с cookie same-origin и разбирает 429/503/сеть', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const api = createHttpGiveawayApi(fetcher, '/api/giveaway/v1');
    fetcher.mockResolvedValueOnce(
      new Response('{"error":"rate_limited"}', { status: 429, headers: { 'Retry-After': '30' } }),
    );
    await expect(api.issueCode()).rejects.toMatchObject({
      kind: 'rate_limited',
      retryAfterSeconds: 30,
    });
    const init = fetcher.mock.calls[0]![1]!;
    expect(fetcher.mock.calls[0]![0]).toBe('/api/giveaway/v1/codes');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
    fetcher.mockResolvedValueOnce(new Response('{}', { status: 503 }));
    await expect(api.getStatus()).rejects.toMatchObject({ kind: 'unavailable' });
    fetcher.mockRejectedValueOnce(new TypeError('failed'));
    await expect(api.getPublic()).rejects.toMatchObject({ kind: 'network' });
  });
});
