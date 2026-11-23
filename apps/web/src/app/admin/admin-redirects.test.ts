import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_NAV } from '../../lib/admin/navigation';

const redirect = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ redirect }));

import OrdersRedirect from './orders/page';
import PromocodesRedirect from './promocodes/page';
import StoreRedirect from './store/page';

const ADMIN_DIR = __dirname;

/// Есть ли page.tsx для href; сегмент [x] подходит под любое значение.
function hasPage(href: string): boolean {
  const segments = href.split('/').filter(Boolean).slice(1); // без «admin»
  let dir = ADMIN_DIR;
  for (const segment of segments) {
    const direct = join(dir, segment);
    if (existsSync(direct) && statSync(direct).isDirectory()) {
      dir = direct;
      continue;
    }
    const dynamic = readdirSync(dir).find(
      (name) => /^\[.+\]$/.test(name) && statSync(join(dir, name)).isDirectory(),
    );
    if (!dynamic) {
      return false;
    }
    dir = join(dir, dynamic);
  }
  return existsSync(join(dir, 'page.tsx'));
}

describe('admin redirects', () => {
  beforeEach(() => redirect.mockClear());

  it('/admin/store -> products', () => {
    StoreRedirect();
    expect(redirect).toHaveBeenCalledWith('/admin/store/products');
  });

  it('/admin/orders -> store/orders', () => {
    OrdersRedirect();
    expect(redirect).toHaveBeenCalledWith('/admin/store/orders');
  });

  it('/admin/promocodes -> store/promocodes', () => {
    PromocodesRedirect();
    expect(redirect).toHaveBeenCalledWith('/admin/store/promocodes');
  });
});

describe('admin navigation hrefs', () => {
  const hrefs = ADMIN_NAV.flatMap((group) =>
    group.items.flatMap((item) => [item.href, ...(item.sections?.map((s) => s.href) ?? [])]),
  );

  it.each([...new Set(hrefs)])('%s has a page.tsx', (href) => {
    expect(hasPage(href)).toBe(true);
  });
});
