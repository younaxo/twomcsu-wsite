import { describe, expect, it } from 'vitest';
import { composeDocumentTitle } from './document-badge';
import { formatPageTitle, PAGE_TITLES, titleForPath } from './page-titles';

describe('заголовки страниц', () => {
  it('formatPageTitle: «Раздел — twomc.su»', () => {
    expect(formatPageTitle('Магазин')).toBe('Магазин — twomc.su');
  });

  it('titleForPath: статичные маршруты, хвостовой слэш, неизвестные и динамические', () => {
    expect(titleForPath('/shop')).toBe(PAGE_TITLES['/shop']);
    expect(titleForPath('/shop/')).toBe('Магазин');
    expect(titleForPath('/shop/cart')).toBe('Корзина');
    expect(titleForPath('/news/some-slug')).toBeNull();
    expect(titleForPath('/')).toBeNull();
    expect(titleForPath(null)).toBeNull();
  });

  it('composeDocumentTitle: сохраняет заголовок страницы, добавляет и снимает бейдж', () => {
    expect(composeDocumentTitle('Магазин — twomc.su', 0)).toBe('Магазин — twomc.su');
    expect(composeDocumentTitle('Магазин — twomc.su', 3)).toBe('(3) Магазин — twomc.su');
    expect(composeDocumentTitle('(3) Магазин — twomc.su', 120)).toBe('(99+) Магазин — twomc.su');
    expect(composeDocumentTitle('(3) Магазин — twomc.su', 0)).toBe('Магазин — twomc.su');
    expect(composeDocumentTitle('', 0)).toBe('twomc.su');
  });

  it('composeDocumentTitle: бейдж + суффикс, повторное применение идемпотентно', () => {
    const admin = 'twomc.su | A [5]';
    const once = composeDocumentTitle('Новости — twomc.su', 4, admin);
    expect(once).toBe('(4) Новости — twomc.su | A [5]');
    expect(composeDocumentTitle(once, 4, admin)).toBe(once);
    expect(composeDocumentTitle(composeDocumentTitle(once, 4, admin), 4, admin)).toBe(once);
  });

  it('composeDocumentTitle: суффикс админки добавляется и не залипает на сайте', () => {
    const admin = 'twomc.su | A [5]';
    expect(composeDocumentTitle('Новости — twomc.su', 0, admin)).toBe('Новости — twomc.su | A [5]');
    expect(composeDocumentTitle('Новости — twomc.su | A [5]', 2, admin)).toBe(
      '(2) Новости — twomc.su | A [5]',
    );
    expect(composeDocumentTitle('Новости — twomc.su | A [5]', 0)).toBe('Новости — twomc.su');
  });
});
