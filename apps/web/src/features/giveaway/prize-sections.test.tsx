import { act, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GiveawayHero } from './giveaway-hero';
import { GiveawayPage } from './giveaway-page';
import { resolveLayout } from './layout';
import { PrizeSections } from './prize-sections';
import { prizesConfig, type PrizesConfig } from './prizes';
import { Reveal } from './reveal';
import type { GiveawayApi, GiveawayPhase, GiveawayPublicInfo } from './types';

const HOUR = 3_600_000;

function info(status: GiveawayPhase, over: Partial<GiveawayPublicInfo> = {}): GiveawayPublicInfo {
  const now = Date.now();
  const start = status === 'before' ? now + 26 * HOUR : now - 48 * HOUR;
  const cutoff = status === 'finished' ? now - HOUR : now + 900 * HOUR;
  return {
    status,
    thresholdMinutes: 3000,
    thresholdHours: 50,
    startAtUtc: new Date(start).toISOString(),
    cutoffAtUtc: new Date(cutoff).toISOString(),
    startAtMsk: '',
    cutoffAtMsk: '',
    ticketsIssued: 0,
    ...over,
  };
}

const pendingApi = {
  getPublic: () => new Promise(() => undefined),
  issueCode: () => new Promise(() => undefined),
  getStatus: () => new Promise(() => undefined),
} as unknown as GiveawayApi;

const clone = (): PrizesConfig => JSON.parse(JSON.stringify(prizesConfig)) as PrizesConfig;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PrizeSections', () => {
  it('порядок разделов 1-10: пять крупных по одному, затем 6-10', () => {
    render(<PrizeSections />);
    const top = within(screen.getByTestId('prize-list-top')).getAllByRole('listitem');
    const rest = within(screen.getByTestId('prize-list-rest')).getAllByRole('listitem');
    expect(top.map((li) => li.getAttribute('data-place'))).toEqual(['1', '2', '3', '4', '5']);
    expect(rest.map((li) => li.getAttribute('data-place'))).toEqual(['6', '7', '8', '9', '10']);
    const headings = screen.getAllByRole('heading', { level: 3 });
    expect(headings).toHaveLength(10);
    expect(headings[0]).toHaveTextContent('Клавиатура AJAZZ AK820');
    expect(screen.getAllByRole('img')).toHaveLength(10);
  });

  it('без карточек: нет плашек, рамок вокруг призов и blur; 6-10 в две колонки, телефон - одна', () => {
    const { container } = render(<PrizeSections />);
    for (const el of Array.from(container.querySelectorAll('li'))) {
      expect(el.className).not.toMatch(/bg-surface|rounded|shadow/);
    }
    for (const el of Array.from(container.querySelectorAll('[class]'))) {
      expect(el.getAttribute('class')).not.toMatch(/blur|backdrop/);
    }
    const rest = screen.getByTestId('prize-list-rest');
    expect(rest.className).toMatch(/grid-cols-1/);
    expect(rest.className).toMatch(/sm:grid-cols-2/);
    expect(screen.getByTestId('prize-10').className).toMatch(/col-span-2/);
  });

  it('значения скрыты при showValue=false и видны при включении', () => {
    const { unmount } = render(<PrizeSections />);
    expect(screen.queryByTestId('prize-value-1')).toBeNull();
    expect(screen.queryByText(/3\s?000/)).toBeNull();
    unmount();
    const on = clone();
    on.showValue = true;
    on.prizes.forEach((p) => (p.showValue = true));
    render(<PrizeSections config={on} />);
    expect(screen.getByTestId('prize-value-1')).toBeTruthy();
  });
});

describe('раскладка страницы', () => {
  it('по умолчанию новая: hero, призы, затем рабочая область без карточки; заголовки по порядку', () => {
    render(<GiveawayPage api={pendingApi} />);
    expect(screen.queryByTestId('giveaway-card')).toBeNull();
    const hero = screen.getByTestId('giveaway-hero');
    const prizes = screen.getByTestId('prize-sections');
    const work = screen.getByTestId('giveaway-workspace');
    const follows = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(hero, prizes)).toBe(true);
    expect(follows(prizes, work)).toBe(true);
    expect(screen.queryByTestId('prize-showcase')).toBeNull();
    const levels = screen
      .getAllByRole('heading')
      .map((h) => Number(h.tagName.slice(1)))
      .slice(0, 4);
    expect(levels).toEqual([1, 2, 2, 3]);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('?layout=cards: карточный вариант, но только вне production', () => {
    expect(resolveLayout('')).toBe('default');
    expect(resolveLayout('?mock=before')).toBe('default');
    expect(resolveLayout('?layout=cards', false)).toBe('cards');
    expect(resolveLayout('?layout=cards&mock=ticket', false)).toBe('cards');
    expect(resolveLayout('?layout=cards', true)).toBe('default');
    expect(resolveLayout('?layout=other', false)).toBe('default');
    render(<GiveawayPage api={pendingApi} layout="cards" />);
    expect(screen.getByTestId('prize-showcase')).toBeInTheDocument();
    expect(screen.getByTestId('giveaway-card')).toBeInTheDocument();
    expect(screen.queryByTestId('prize-sections')).toBeNull();
  });

  it('в production-сборке параметр игнорируется (NODE_ENV=production)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(resolveLayout('?layout=cards')).toBe('default');
    vi.unstubAllEnvs();
  });
});

describe('GiveawayHero', () => {
  it('до старта: таймер до старта и подпись «по МСК»', () => {
    render(<GiveawayHero info={info('before')} />);
    expect(screen.getByRole('timer')).toHaveAccessibleName(/До старта осталось 1 день 1 час/);
    expect(screen.getByTestId('giveaway-hero')).toHaveTextContent(/по МСК/);
  });

  it('идёт: таймер до конца (cutoffAt), подпись «по МСК»', () => {
    render(<GiveawayHero info={info('running')} />);
    expect(screen.getByRole('timer')).toHaveAccessibleName(/До конца розыгрыша осталось 37 дней/);
    expect(screen.getByTestId('giveaway-hero')).toHaveTextContent(/Конец: .*по МСК/);
  });

  it('после отсечки: «Розыгрыш завершён», таймера и якоря нет', () => {
    const { unmount } = render(<GiveawayHero info={info('finished')} />);
    expect(screen.getByTestId('hero-timer-finished')).toHaveTextContent('Розыгрыш завершён');
    expect(screen.queryByRole('timer')).toBeNull();
    expect(screen.queryByTestId('hero-anchor')).toBeNull();
    unmount();
    // Статус ещё running, но cutoff уже в прошлом: клиентские часы тоже показывают «завершён».
    render(
      <GiveawayHero
        info={info('running', { cutoffAtUtc: new Date(Date.now() - 5).toISOString() })}
      />,
    );
    expect(screen.getByTestId('hero-timer-finished')).toBeInTheDocument();
  });

  it('три шага; порог и даты - из /public, не из кода', () => {
    render(<GiveawayHero info={info('running', { thresholdHours: 72 })} />);
    const steps = within(screen.getByTestId('how-steps')).getAllByRole('listitem');
    expect(steps).toHaveLength(3);
    expect(steps[0]).toHaveTextContent('Наберите 72 часа онлайна');
    expect(steps[2]).toHaveTextContent('/giveaway XXXX-XXXX-XXXX-XXXX');
    expect(screen.getByTestId('hero-dates')).toHaveTextContent(/Билеты выдаются с .* до .*по МСК/);
  });

  it('якорь «Получить код» ведёт на существующую рабочую область', () => {
    render(<GiveawayPage api={pendingApi} />);
    const anchor = screen.getByRole('link', { name: /Получить код/ });
    expect(anchor).toHaveAttribute('href', '#gw-workspace');
    const target = document.getElementById('gw-workspace');
    expect(target).not.toBeNull();
    expect(target).toBe(screen.getByTestId('giveaway-workspace'));
    expect(target).toHaveAttribute('tabindex', '-1');
  });
});

describe('Reveal: появление при прокрутке', () => {
  function stubMatchMedia(reduced: boolean) {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: reduced,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      })),
    );
    window.matchMedia = globalThis.matchMedia;
  }

  it('prefers-reduced-motion: контент виден сразу, наблюдатель не создаётся', () => {
    stubMatchMedia(true);
    const ctor = vi.fn();
    vi.stubGlobal('IntersectionObserver', ctor);
    const { container } = render(<Reveal>текст</Reveal>);
    expect(ctor).not.toHaveBeenCalled();
    const el = container.firstElementChild!;
    expect(el.getAttribute('data-reveal')).toBe('idle');
    expect(el.className).not.toMatch(/opacity-0/);
  });

  it('без reduced-motion: скрыт до пересечения, затем показан; переходы только motion-safe', () => {
    stubMatchMedia(false);
    let trigger: (entries: Array<{ isIntersecting: boolean }>) => void = () => undefined;
    const disconnect = vi.fn();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: typeof trigger) {
          trigger = cb;
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    const { container } = render(<Reveal>текст</Reveal>);
    const el = container.firstElementChild!;
    expect(el.getAttribute('data-reveal')).toBe('hidden');
    for (const t of el.className.split(/\s+/)) {
      if (/(^|:)(transition|duration|ease)/.test(t))
        expect(t.startsWith('motion-safe:')).toBe(true);
    }
    act(() => trigger([{ isIntersecting: true }]));
    expect(el.getAttribute('data-reveal')).toBe('shown');
    expect(el.className).not.toMatch(/opacity-0/);
    // В обе стороны: наблюдатель не отключается, при выходе из экрана снова скрыт.
    expect(disconnect).not.toHaveBeenCalled();
    act(() => trigger([{ isIntersecting: false }]));
    expect(el.getAttribute('data-reveal')).toBe('hidden');
    act(() => trigger([{ isIntersecting: true }]));
    expect(el.getAttribute('data-reveal')).toBe('shown');
  });
});
