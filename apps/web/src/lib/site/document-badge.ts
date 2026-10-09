'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { SITE_NAME } from './config';
import { useUnreadCount } from './hooks';

/// Бейдж вкладки: заголовок `(N) twomc.su` и favicon с красным счётчиком.
///
/// Стратегия unread (единый источник правды, не считаем в пяти местах):
///   total = notificationsUnread (GET /notifications/unread-count, TanStack
///   Query `siteKeys.unread`, refetch 60 с) [+ messagesUnread — когда появится
///   счётчик непрочитанных личных сообщений, он добавляется ЗДЕСЬ, и title,
///   favicon и колокольчик видят одно и то же число].
/// Анониму — базовое состояние. Максимум в UI — 99+.
///
/// Favicon рисуется на canvas поверх базового логотипа (/icon.png — тот же
/// origin, canvas не «портится»), результат кэшируется по значению счётчика —
/// новый favicon не создаётся на каждый рендер, при 0 возвращается исходный
/// href. Всё — только в эффектах: SSR/гидрация не затрагиваются.

export const BADGE_MAX = 99;
const BASE_ICON_SRC = '/icon.png';
const BADGE_LINK_ATTR = 'data-document-badge';

export function formatBadgeCount(count: number): string {
  return count > BADGE_MAX ? `${BADGE_MAX}+` : String(count);
}

export function formatDocumentTitle(count: number, base: string = SITE_NAME): string {
  return count > 0 ? `(${formatBadgeCount(count)}) ${base}` : base;
}

const faviconCache = new Map<number, string>();
let baseImagePromise: Promise<HTMLImageElement> | null = null;
/// Номер последнего вызова: async-генерация не должна перезаписать более
/// свежее состояние (быстрая смена счётчика).
let applySeq = 0;

function loadBaseImage(): Promise<HTMLImageElement> {
  if (!baseImagePromise) {
    baseImagePromise = new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => {
        baseImagePromise = null;
        reject(new Error('favicon base image failed'));
      };
      image.src = BASE_ICON_SRC;
    });
  }
  return baseImagePromise;
}

/// Собственная ссылка бейджа. ВСЕГДА PNG: базовое состояние — официальный
/// логотип `/icon.png`, с unread — data:image/png с бейджем. (Причина бага
/// с артефактом: раньше в базовом состоянии ссылка с `type="image/png"`
/// указывала на `favicon.ico` — браузер брал её последней и рисовал мусор.)
/// Ссылка держится последней в <head>: после клиентской навигации Next
/// перерисовывает свои icon-теги, и браузер должен по-прежнему выбрать нашу.
function ensureBadgeLink(): HTMLLinkElement {
  let link = document.head.querySelector<HTMLLinkElement>(`link[${BADGE_LINK_ATTR}]`);
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/png';
    link.setAttribute('sizes', '64x64');
    link.setAttribute(BADGE_LINK_ATTR, '');
    link.href = BASE_ICON_SRC;
  }
  if (document.head.lastElementChild !== link) {
    document.head.appendChild(link);
  }
  return link;
}

function setHref(link: HTMLLinkElement, href: string): void {
  if (link.getAttribute('href') !== href) {
    link.setAttribute('href', href);
  }
}

/// Рисует бейдж: красная «таблетка» в правом нижнем углу, белый текст,
/// тёмная обводка для отделения от логотипа. Логотип не обрезается.
export function drawBadgedFavicon(base: HTMLImageElement, count: number, size = 64): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return base.src;
  }
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(base, 0, 0, size, size);
  const label = formatBadgeCount(count);
  const radius = size * 0.24;
  const width = Math.min(size, Math.max(radius * 2, label.length * size * 0.2 + size * 0.12));
  const left = size - width;
  const top = size - radius * 2;
  ctx.fillStyle = '#e5484d';
  ctx.strokeStyle = '#171715';
  ctx.lineWidth = size * 0.05;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(left, top, width, radius * 2, radius);
  } else {
    ctx.arc(size - radius, size - radius, radius, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  const fontSize = label.length > 2 ? size * 0.26 : size * 0.32;
  ctx.font = `700 ${Math.round(fontSize)}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, left + width / 2, top + radius + size * 0.015);
  return canvas.toDataURL('image/png');
}

async function applyFavicon(count: number): Promise<void> {
  const seq = ++applySeq;
  const link = ensureBadgeLink();
  if (count <= 0) {
    setHref(link, BASE_ICON_SRC);
    return;
  }
  const key = Math.min(count, BADGE_MAX + 1);
  let href = faviconCache.get(key);
  if (!href) {
    try {
      const base = await loadBaseImage();
      href = drawBadgedFavicon(base, key);
    } catch {
      setHref(link, BASE_ICON_SRC);
      return;
    }
    if (href.startsWith('data:image/png')) {
      faviconCache.set(key, href);
    }
  }
  if (seq === applySeq) {
    setHref(link, href);
  }
}

/// Применяет title + favicon для переданного счётчика. `routeKey` — текущий
/// путь: после клиентской навигации Next выставляет title из metadata и
/// перерисовывает icon-теги, поэтому бейдж переприменяется.
export function useDocumentBadgeFor(
  count: number,
  baseTitle: string = SITE_NAME,
  routeKey?: string,
): void {
  useEffect(() => {
    document.title = formatDocumentTitle(count, baseTitle);
    void applyFavicon(count);
  }, [count, baseTitle, routeKey]);
}

/// Хук для оболочки: берёт unread из общего состояния уведомлений.
export function useDocumentBadge(baseTitle: string = SITE_NAME): number {
  const unread = useUnreadCount();
  const pathname = usePathname();
  const count = unread.data?.count ?? 0;
  useDocumentBadgeFor(count, baseTitle, pathname);
  return count;
}
