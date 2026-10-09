import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  drawBadgedFavicon,
  formatBadgeCount,
  formatDocumentTitle,
  useDocumentBadgeFor,
} from './document-badge';

function Harness({ count }: { count: number }) {
  useDocumentBadgeFor(count);
  return null;
}

afterEach(() => {
  document.title = '';
  document.head.innerHTML = '';
  vi.restoreAllMocks();
});

describe('document badge', () => {
  it('title: twomc.su без unread, (N) twomc.su с unread, максимум 99+', () => {
    expect(formatDocumentTitle(0)).toBe('twomc.su');
    expect(formatDocumentTitle(3)).toBe('(3) twomc.su');
    expect(formatDocumentTitle(12)).toBe('(12) twomc.su');
    expect(formatDocumentTitle(250)).toBe('(99+) twomc.su');
    expect(formatBadgeCount(99)).toBe('99');
    expect(formatBadgeCount(100)).toBe('99+');
  });

  it('хук выставляет document.title и не трогает его лишний раз при 0', () => {
    const { rerender } = render(<Harness count={0} />);
    expect(document.title).toBe('twomc.su');
    rerender(<Harness count={5} />);
    expect(document.title).toBe('(5) twomc.su');
    rerender(<Harness count={0} />);
    expect(document.title).toBe('twomc.su');
  });

  it('favicon: одна PNG-ссылка бейджа, последняя в head; при 0 — официальный логотип, не favicon.ico', () => {
    const base = document.createElement('link');
    base.rel = 'icon';
    base.href = '/favicon.ico';
    document.head.appendChild(base);
    const { rerender } = render(<Harness count={0} />);
    rerender(<Harness count={1} />);
    rerender(<Harness count={0} />);
    const badged = document.querySelectorAll<HTMLLinkElement>('link[data-document-badge]');
    expect(badged).toHaveLength(1);
    expect(badged[0].type).toBe('image/png');
    // Регрессия: PNG-ссылка не должна указывать на ICO-данные.
    expect(badged[0].getAttribute('href')).toBe('/icon.png');
    expect(document.head.lastElementChild).toBe(badged[0]);
  });

  it('drawBadgedFavicon возвращает исходник, если canvas недоступен', () => {
    const image = new Image();
    image.src = 'http://localhost/icon.png';
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    expect(drawBadgedFavicon(image, 7)).toBe('http://localhost/icon.png');
  });
});
