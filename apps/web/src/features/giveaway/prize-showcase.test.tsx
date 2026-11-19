import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GiveawayPage } from './giveaway-page';
import { prizeImageSrc } from './prize-images';
import { PrizeShowcase } from './prize-showcase';
import { prizesConfig, validatePrizesConfig, type PrizesConfig } from './prizes';
import type { GiveawayApi } from './types';

const clone = (): PrizesConfig => JSON.parse(JSON.stringify(prizesConfig)) as PrizesConfig;

describe('prizes.json', () => {
  it('валиден: 10 мест, значения скрыты, картинки подключены и существуют', () => {
    const c = validatePrizesConfig(clone());
    expect(c.prizes).toHaveLength(10);
    expect(c.showValue).toBe(false);
    expect(c.prizes.every((p) => p.showValue === false)).toBe(true);
    const dir = path.resolve(__dirname, '../../../../../giveaway/assets/prizes');
    const files = readdirSync(dir);
    for (const p of c.prizes) {
      expect(files).toContain(p.image);
      expect(prizeImageSrc(p.image)).toBeTruthy();
    }
    for (const f of files) expect(statSync(path.join(dir, f)).size).toBeLessThanOrEqual(200 * 1024);
  });

  it('отклоняет битый конфиг', () => {
    const dup = clone();
    dup.prizes[1]!.place = 1;
    expect(() => validatePrizesConfig(dup)).toThrow(/места/);
    const bad = clone();
    bad.podium.order = [1, 2, 3];
    expect(() => validatePrizesConfig(bad)).toThrow(/покрывать/);
    const noVal = clone() as unknown as Record<string, unknown>;
    delete noVal.showValue;
    expect(() => validatePrizesConfig(noVal)).toThrow(/showValue/);
  });
});

describe('PrizeShowcase', () => {
  it('пьедестал: колонки и высоты берутся из конфига', () => {
    render(<PrizeShowcase />);
    const col = (n: number) => screen.getByTestId(`prize-${n}`).style.getPropertyValue('--col');
    const order = prizesConfig.podium.order;
    order.forEach((place, i) => expect(col(place)).toBe(String(i + 1)));
    expect(col(1)).toBe('3');
    const h = (n: number) =>
      parseFloat(screen.getByTestId(`prize-${n}`).style.getPropertyValue('--h'));
    expect(h(1)).toBeGreaterThan(h(2));
    expect(h(2)).toBeGreaterThan(h(3));
    expect(h(5)).toBeGreaterThan(h(4));
    expect(screen.getByTestId('prize-6').style.getPropertyValue('--row')).toBe('2');
  });

  it('значения скрыты при showValue=false и видны при включении', () => {
    const { unmount } = render(<PrizeShowcase />);
    expect(screen.queryByTestId('prize-value-1')).toBeNull();
    expect(screen.queryByText(/3\s?000/)).toBeNull();
    unmount();
    const on = clone();
    on.showValue = true;
    on.prizes.forEach((p) => (p.showValue = true));
    render(<PrizeShowcase config={on} />);
    expect(screen.getByTestId('prize-value-1')).toBeTruthy();
  });

  it('порядок чтения 1-10, у каждого приза заголовок и alt', () => {
    render(<PrizeShowcase />);
    const items = within(screen.getByTestId('prize-list')).getAllByRole('listitem');
    expect(items.map((li) => li.getAttribute('data-place'))).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
    ]);
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(10);
    expect(screen.getAllByRole('img')).toHaveLength(10);
    expect(screen.getByTestId('prize-list').className).toMatch(/grid-cols-1.*sm:grid-cols-2/);
  });

  it('reduced-motion: движение только через motion-safe, без blur', () => {
    const { container } = render(<PrizeShowcase />);
    for (const el of Array.from(container.querySelectorAll('[class]'))) {
      const tokens = el.getAttribute('class')!.split(/\s+/);
      for (const t of tokens) {
        if (/(^|:)(animate|transition|duration)/.test(t))
          expect(t.startsWith('motion-safe:')).toBe(true);
        expect(t).not.toMatch(/blur|backdrop/);
      }
    }
  });
});

describe('GiveawayPage', () => {
  it('блок призов расположен выше рабочей области', () => {
    const api: GiveawayApi = {
      getPublic: () => new Promise(() => undefined),
      issueCode: () => new Promise(() => undefined),
      getStatus: () => new Promise(() => undefined),
    } as unknown as GiveawayApi;
    render(<GiveawayPage api={api} />);
    const prizes = screen.getByTestId('prize-showcase');
    const card = screen.getByTestId('giveaway-card');
    expect(prizes.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
