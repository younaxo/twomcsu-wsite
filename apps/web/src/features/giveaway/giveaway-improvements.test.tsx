import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GiveawayHero } from './giveaway-hero';
import { GiveawayPage } from './giveaway-page';
import { HIGHLIGHT_MS } from './use-workspace-scroll';
import { ReelChar, REEL_LETTERS, REEL_TOTAL_MS, reelSequence } from './ticket-reel';
import { saveTicketPng, ticketFileName, trackingUrl } from './ticket-image';
import { TicketCard } from './ticket-card';
import { TrackedTicketView } from './tracked-ticket-view';
import { fetchTrackedTicket, type TrackedTicket } from './track-api';
import type { GiveawayApi, GiveawayCodeStatus, GiveawayPublicInfo } from './types';

vi.mock('@/components/ui/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

const HOUR = 3_600_000;
const NOW = Date.parse('2026-11-20T12:00:00.000Z');
const TOKEN = 'abcDEF0123456789_-abcDEF0123456789';

function info(): GiveawayPublicInfo {
  return {
    status: 'running',
    thresholdMinutes: 3000,
    thresholdHours: 50,
    startAtUtc: new Date(NOW - 48 * HOUR).toISOString(),
    cutoffAtUtc: new Date(NOW + 900 * HOUR).toISOString(),
    startAtMsk: '',
    cutoffAtMsk: '',
    ticketsIssued: 7,
  };
}

function makeApi(over: Partial<GiveawayApi> = {}): GiveawayApi {
  return {
    getPublic: vi.fn(async () => info()),
    issueCode: vi.fn(async () => ({
      code: 'ABCD-EFGH-JKMN-PQRS',
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      ttlSeconds: 600,
    })),
    getStatus: vi.fn(async (): Promise<GiveawayCodeStatus> => ({ status: 'none' })),
    ...over,
  };
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

function stubClipboard() {
  const writeText = vi.fn(async () => {});
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  return writeText;
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

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  setReducedMotion(false);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.documentElement.style.scrollBehavior = '';
});

describe('«Как участвовать»: путь из трёх шагов', () => {
  it('три шага, команда-образец и копирование', async () => {
    const writeText = stubClipboard();
    render(<GiveawayHero info={info()} />);
    const steps = within(screen.getByTestId('how-steps')).getAllByRole('listitem');
    expect(steps).toHaveLength(3);
    expect(steps[0]).toHaveTextContent('Наберите 50 часов онлайна');
    expect(steps[1]).toHaveTextContent('Получите код на этом сайте');
    expect(screen.getByTestId('how-command')).toHaveTextContent('/giveaway XXXX-XXXX-XXXX-XXXX');
    expect(screen.getByTestId('how-command').tagName).toBe('CODE');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Копировать' }));
    });
    expect(writeText).toHaveBeenCalledWith('/giveaway XXXX-XXXX-XXXX-XXXX');
  });

  it('выданный код подставляется в команду и в буфер', async () => {
    const writeText = stubClipboard();
    render(<GiveawayHero info={info()} code="ABCD-EFGH-JKMN-PQRS" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Копировать' }));
    });
    expect(screen.getByTestId('how-command')).toHaveTextContent('/giveaway ABCD-EFGH-JKMN-PQRS');
    expect(writeText).toHaveBeenCalledWith('/giveaway ABCD-EFGH-JKMN-PQRS');
  });

  it('прогресс скрыт, пока неизвестен, и показан при попытке ввода кода', async () => {
    const { unmount } = render(<GiveawayHero info={info()} />);
    expect(screen.queryByTestId('how-progress')).toBeNull();
    unmount();
    render(
      <GiveawayHero
        info={info()}
        progress={{ minutes: 1710, thresholdMinutes: 3000, remainingMinutes: 1290 }}
      />,
    );
    const progress = screen.getByTestId('how-progress');
    expect(progress).toHaveTextContent('28 ч 30 мин');
    expect(progress).toHaveTextContent('осталось');
    expect(within(progress).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '57');
  });

  it('страница: прогресс из lastAttempt; без попытки и без билета скрыт', async () => {
    const api = makeApi({
      getStatus: vi.fn(async (): Promise<GiveawayCodeStatus> => ({
        status: 'pending',
        expiresAt: new Date(Date.now() + 500_000).toISOString(),
        lastAttempt: {
          result: 'not_enough',
          minutes: 1710,
          remainingMinutes: 1290,
          thresholdMinutes: 3000,
        },
      })),
    });
    const { unmount } = render(<GiveawayPage api={api} />);
    await flush();
    expect(screen.getByTestId('how-progress')).toHaveTextContent('21 ч 30 мин');
    unmount();
    render(<GiveawayPage api={makeApi()} />);
    await flush();
    expect(screen.queryByTestId('how-progress')).toBeNull();
  });
});

describe('«Получить код»: прокрутка, подсветка и фокус', () => {
  it('плавная прокрутка, фокус в область, мягкая подсветка и затухание', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    render(<GiveawayPage api={makeApi()} />);
    await flush();
    expect(document.documentElement.style.scrollBehavior).toBe('smooth');
    fireEvent.click(screen.getByTestId('hero-anchor'));
    const work = screen.getByTestId('giveaway-workspace');
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(document.activeElement).toBe(work);
    expect(work).toHaveAttribute('data-highlight', 'true');
    // Без обводки и свечения: только смена фона.
    expect(work.className).toContain('bg-primary-soft');
    expect(work.className).not.toMatch(/ring|shadow|border|blur/);
    await advance(HIGHLIGHT_MS + 50);
    expect(work).toHaveAttribute('data-highlight', 'false');
  });

  it('prefers-reduced-motion: без smooth и без подсветки, фокус остаётся', async () => {
    setReducedMotion(true);
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    render(<GiveawayPage api={makeApi()} />);
    await flush();
    expect(document.documentElement.style.scrollBehavior).toBe('auto');
    fireEvent.click(screen.getByTestId('hero-anchor'));
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
    expect(document.activeElement).toBe(screen.getByTestId('giveaway-workspace'));
    expect(screen.getByTestId('giveaway-workspace')).toHaveAttribute('data-highlight', 'false');
  });

  it('при уходе со страницы scroll-behavior возвращается', async () => {
    document.documentElement.style.scrollBehavior = 'auto';
    const { unmount } = render(<GiveawayPage api={makeApi()} />);
    await flush();
    unmount();
    expect(document.documentElement.style.scrollBehavior).toBe('auto');
  });
});

describe('билет: PNG и ссылка отслеживания', () => {
  it('имя файла содержит номер билета', () => {
    expect(ticketFileName('K417')).toBe('twomc-ticket-K417.png');
    expect(trackingUrl('https://giveaway.twomc.su/', TOKEN)).toBe(
      `https://giveaway.twomc.su/giveaway/ticket/${TOKEN}`,
    );
  });

  it('saveTicketPng рисует на canvas и скачивает файл с номером в имени', async () => {
    vi.useRealTimers();
    const fillText = vi.fn();
    const ctx = {
      fillRect: vi.fn(),
      fillText,
      set fillStyle(_v: string) {},
      set font(_v: string) {},
      set textAlign(_v: string) {},
      set textBaseline(_v: string) {},
    };
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    const toBlob = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation((cb) => cb(new Blob(['x'], { type: 'image/png' })));
    URL.createObjectURL = vi.fn(() => 'blob:ticket');
    URL.revokeObjectURL = vi.fn();
    let downloaded = '';
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloaded = this.download;
    });
    const name = await saveTicketPng({
      ticket: 'K417',
      playerName: 'Steve',
      issuedAt: '2026-12-01T10:00:00.000Z',
    });
    expect(getContext).toHaveBeenCalledWith('2d');
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png');
    const texts = fillText.mock.calls.map((c) => String(c[0]));
    expect(texts).toContain('K417');
    expect(texts.some((t) => t.includes('Steve'))).toBe(true);
    expect(texts.some((t) => t.includes('по МСК'))).toBe(true);
    expect(texts).toContain('giveaway.twomc.su');
    expect(name).toBe('twomc-ticket-K417.png');
    expect(downloaded).toBe('twomc-ticket-K417.png');
    click.mockRestore();
    getContext.mockRestore();
    toBlob.mockRestore();
  });

  it('кнопка «Скопировать ссылку для отслеживания» копирует /giveaway/ticket/<токен>', async () => {
    const writeText = stubClipboard();
    render(
      <TicketCard
        ticket="K417"
        playerName="Steve"
        animate={false}
        issuedAt="2026-12-01T10:00:00.000Z"
        trackingToken={TOKEN}
      />,
    );
    expect(screen.getByRole('button', { name: 'Сохранить билет' })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Скопировать ссылку для отслеживания' }));
    });
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/giveaway/ticket/${TOKEN}`);
  });

  it('без токена кнопки ссылки нет', () => {
    render(<TicketCard ticket="K417" playerName="Steve" animate={false} />);
    expect(screen.queryByRole('button', { name: /ссылку для отслеживания/ })).toBeNull();
  });
});

describe('страница отслеживания', () => {
  const data: TrackedTicket = {
    ticket: 'K417',
    playerName: 'Steve',
    played: { hours: 52, minutes: 5 },
    status: 'running',
  };

  it('показывает только номер, ник, время и статус; без призов и шапки розыгрыша', async () => {
    const load = vi.fn(async () => ({ kind: 'ok' as const, data }));
    render(<TrackedTicketView token={TOKEN} load={load} />);
    await flush();
    expect((load.mock.calls as unknown[][])[0]?.[0]).toBe(TOKEN);
    const page = screen.getByTestId('track-page');
    expect(page).toHaveTextContent('Steve');
    expect(screen.getByTestId('track-played')).toHaveTextContent('52 ч 5 мин');
    expect(screen.getByTestId('track-status')).toHaveTextContent('идёт');
    expect(screen.getByRole('img', { name: 'Билет K 4 1 7' })).toBeInTheDocument();
    expect(page).not.toHaveTextContent(/приз|Как участвовать|Получить код/i);
    expect(screen.queryByTestId('giveaway-hero')).toBeNull();
    expect(screen.queryByTestId('site-header')).toBeNull();
  });

  it('завершён и «не найден» (единое сообщение)', async () => {
    const { unmount } = render(
      <TrackedTicketView
        token={TOKEN}
        load={async () => ({ kind: 'ok', data: { ...data, status: 'finished' } })}
      />,
    );
    await flush();
    expect(screen.getByTestId('track-status')).toHaveTextContent('завершён');
    unmount();
    render(<TrackedTicketView token={TOKEN} load={async () => ({ kind: 'not_found' })} />);
    await flush();
    expect(screen.getByRole('alert')).toHaveTextContent('Билет не найден');
  });

  it('fetchTrackedTicket: неверный формат без запроса, 404 и ответ 200', async () => {
    const fetcher = vi.fn(async (url: RequestInfo | URL) =>
      String(url).endsWith(TOKEN)
        ? new Response(JSON.stringify(data), { status: 200 })
        : new Response(null, { status: 404 }),
    ) as unknown as typeof fetch;
    expect(await fetchTrackedTicket('K417', fetcher)).toEqual({ kind: 'not_found' });
    expect(await fetchTrackedTicket('../etc/passwd', fetcher)).toEqual({ kind: 'not_found' });
    expect(fetcher).not.toHaveBeenCalled();
    expect(await fetchTrackedTicket('z'.repeat(30), fetcher)).toEqual({ kind: 'not_found' });
    expect(await fetchTrackedTicket(TOKEN, fetcher, '/api/giveaway/v1')).toEqual({
      kind: 'ok',
      data,
    });
    expect(vi.mocked(fetcher).mock.calls.at(-1)?.[0]).toBe(
      `/api/giveaway/v1/tickets/track/${TOKEN}`,
    );
  });
});

describe('«барабан» билета', () => {
  it('лента: алфавит билета без I и O, последний символ - итоговый', () => {
    expect(REEL_LETTERS).not.toMatch(/[IO]/);
    for (const [final, idx] of [
      ['K', 0],
      ['Z', 0],
      ['A', 0],
      ['4', 1],
      ['0', 2],
      ['7', 3],
    ] as const) {
      const seq = reelSequence(final, idx);
      expect(seq[seq.length - 1]).toBe(final);
      expect(seq.join('')).not.toMatch(idx === 0 ? /[IO\d]/ : /[A-Z]/);
    }
    // Правее - длиннее лента.
    expect(reelSequence('1', 3).length).toBeGreaterThan(reelSequence('K', 0).length);
  });

  it('символы останавливаются по очереди слева направо и остаются билетом', async () => {
    render(
      <div>
        {'K417'.split('').map((c, i) => (
          <ReelChar key={i} char={c} index={i} play />
        ))}
      </div>,
    );
    const cells = () => screen.getAllByTestId('ticket-char');
    expect(cells().map((n) => n.getAttribute('data-done'))).toEqual([
      'false',
      'false',
      'false',
      'false',
    ]);
    // Цвет - акцент сайта; рамок и подсветки нет.
    for (const cell of cells()) {
      expect(cell.className).toContain('text-primary');
      expect(cell.className).not.toMatch(/border|ring|shadow|blur|bg-/);
      expect(cell.style.maskImage || cell.getAttribute('style')).toMatch(/linear-gradient|mask/);
    }
    await advance(2_200);
    expect(cells().map((n) => n.getAttribute('data-done'))).toEqual([
      'true',
      'false',
      'false',
      'false',
    ]);
    await advance(REEL_TOTAL_MS - 2_200 + 50);
    expect(cells().map((n) => n.textContent)).toEqual(['K', '4', '1', '7']);
    expect(cells().every((n) => n.getAttribute('data-done') === 'true')).toBe(true);
  });

  it('prefers-reduced-motion: сразу результат, ленты нет', () => {
    setReducedMotion(true);
    render(<TicketCard ticket="B042" playerName="Alex" animate />);
    expect(screen.getByTestId('ticket-card')).toHaveAttribute('data-settled', 'true');
    expect(screen.getAllByTestId('ticket-char').map((n) => n.textContent)).toEqual([
      'B',
      '0',
      '4',
      '2',
    ]);
  });
});
