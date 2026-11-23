import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BONUS_LINK,
  FOOTER_LEGAL_LINKS,
  FOOTER_PLAYER_LINKS,
  SITE_NAVIGATION,
} from '@/lib/site/config';
import { miniProfileEntries } from './mini-profile';

const APP_DIR = join(process.cwd(), 'src', 'app');

/// Сегменты маршрута -> существует ли page.tsx; (группы) прозрачны, [x] — любой сегмент.
function routeExists(dir: string, segments: string[]): boolean {
  if (segments.length === 0) {
    if (existsSync(join(dir, 'page.tsx'))) return true;
  }
  const children = readdirSync(dir).filter((name) => statSync(join(dir, name)).isDirectory());
  // Группы маршрутов не занимают сегмент URL.
  for (const group of children.filter((n) => /^\(.+\)$/.test(n))) {
    if (routeExists(join(dir, group), segments)) return true;
  }
  if (segments.length === 0) return false;
  const [head, ...rest] = segments;
  for (const name of children) {
    if (name === head && routeExists(join(dir, name), rest)) return true;
    if (/^\[[^\]]+\]$/.test(name) && routeExists(join(dir, name), rest)) return true;
  }
  return false;
}

function pathOf(href: string): string[] {
  return href.split(/[?#]/)[0].split('/').filter(Boolean);
}

describe('ссылки меню ведут на существующие маршруты', () => {
  it('SITE_NAVIGATION и «Бонусы»', () => {
    for (const item of [...SITE_NAVIGATION, BONUS_LINK]) {
      if ('available' in item && item.available === false) continue;
      expect(routeExists(APP_DIR, pathOf(item.href)), item.href).toBe(true);
    }
  });

  it('футер: внутренние доступные ссылки', () => {
    for (const link of [...FOOTER_PLAYER_LINKS, ...FOOTER_LEGAL_LINKS]) {
      if (!link.available || link.external) continue;
      expect(routeExists(APP_DIR, pathOf(link.href)), link.href).toBe(true);
    }
  });

  it('меню профиля: все пункты с href', () => {
    for (const entry of miniProfileEntries('Steve', {})) {
      if (entry.href === null) continue;
      expect(routeExists(APP_DIR, pathOf(entry.href)), entry.href).toBe(true);
    }
  });

  it('помощник: несуществующий маршрут не находится', () => {
    expect(routeExists(APP_DIR, ['no-such-page'])).toBe(false);
    expect(routeExists(APP_DIR, ['shop', 'some-slug'])).toBe(true);
  });
});
