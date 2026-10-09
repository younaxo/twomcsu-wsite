'use client';

import {
  ArrowLeft,
  ArrowRight,
  Copy,
  ExternalLink,
  LayoutDashboard,
  Link2,
  RotateCw,
  ShoppingBag,
  User,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/toast';
import { ADMIN_ENTRY_REQUIREMENT } from '@/lib/admin/navigation';
import { checkPermissions } from '@/lib/auth/permissions';
import { useAuthStore } from '@/lib/auth/store';
import { classifyLink } from '@/lib/site/external-links';

/// Собственное контекстное меню сайта (ADR-0077) — у курсора, по месту клика.
/// Цель определяется по приоритету: выделенный текст → `[data-context]`
/// (пользователь, товар, изображение) → ссылка → изображение → пустое место.
/// Нативное меню остаётся: на touch, по Shift+ПКМ, в полях ввода (вставка,
/// орфография) и там, где компонент открыл своё меню (Radix ContextMenu —
/// событие уже `defaultPrevented`). Все действия доступны и обычными кнопками;
/// DevTools не блокируются.

export type ContextTarget =
  | { kind: 'selection'; text: string }
  | { kind: 'link'; href: string; external: boolean }
  | { kind: 'user'; username: string }
  | { kind: 'product'; name: string }
  | { kind: 'image'; protected: boolean }
  | { kind: 'page' };

const EDITABLE = 'input, textarea, select, [contenteditable="true"], [contenteditable=""]';

/// Что под курсором (чистая функция — тестируется отдельно).
export function resolveContextTarget(
  target: Element | null,
  selectionText: string,
  origin: string,
): ContextTarget | null {
  if (!target) return { kind: 'page' };
  if (target.closest(EDITABLE)) return null;
  if (selectionText.trim()) return { kind: 'selection', text: selectionText };
  let tagged = target.closest<HTMLElement>('[data-context]');
  // Изображение внутри карточки (товар, пользователь) — меню сущности.
  if (tagged?.dataset.context === 'image') {
    tagged = tagged.parentElement?.closest<HTMLElement>('[data-context]') ?? tagged;
  }
  if (tagged) {
    const kind = tagged.dataset.context;
    if (kind === 'user' && tagged.dataset.contextUsername) {
      return { kind: 'user', username: tagged.dataset.contextUsername };
    }
    if (kind === 'product' && tagged.dataset.contextName) {
      return { kind: 'product', name: tagged.dataset.contextName };
    }
    if (kind === 'image') return { kind: 'image', protected: true };
  }
  const anchor = target.closest<HTMLAnchorElement>('a[href]');
  if (anchor) {
    const kind = classifyLink(anchor.getAttribute('href'), origin);
    if (kind === 'blocked') return { kind: 'page' };
    return { kind: 'link', href: anchor.href, external: kind === 'external' };
  }
  if (target.closest('img, svg')) return { kind: 'image', protected: false };
  return { kind: 'page' };
}

async function copy(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
  } catch {
    toast.error('Не удалось скопировать.');
  }
}

export function SiteContextMenu({ children }: { children?: ReactNode }) {
  const router = useRouter();
  const [menu, setMenu] = useState<{ x: number; y: number; target: ContextTarget } | null>(null);

  useEffect(() => {
    // Фаза всплытия: React-обработчики компонентов (свои меню) срабатывают раньше.
    const onContextMenu = (event: MouseEvent) => {
      if (event.defaultPrevented || event.shiftKey) return;
      if (!window.matchMedia('(pointer: fine)').matches) return;
      const target = resolveContextTarget(
        event.target as Element | null,
        window.getSelection()?.toString() ?? '',
        window.location.origin,
      );
      if (!target) return;
      event.preventDefault();
      setMenu({ x: event.clientX, y: event.clientY, target });
    };
    document.addEventListener('contextmenu', onContextMenu);
    return () => document.removeEventListener('contextmenu', onContextMenu);
  }, []);

  const canAdmin = checkPermissions(
    useAuthStore.getState().user?.permissions,
    ADMIN_ENTRY_REQUIREMENT,
  );
  const target = menu?.target;

  return (
    <>
      {children}
      <DropdownMenu
        open={menu !== null}
        onOpenChange={(open) => !open && setMenu(null)}
        modal={false}
      >
        <DropdownMenuTrigger asChild>
          <span
            aria-hidden
            data-testid="context-menu-anchor"
            className="pointer-events-none fixed size-0"
            style={{ left: menu?.x ?? 0, top: menu?.y ?? 0 }}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={2}
          className="min-w-[13rem]"
          data-testid="site-context-menu"
        >
          {target?.kind === 'selection' ? (
            <DropdownMenuItem onSelect={() => void copy(target.text, 'Текст скопирован')}>
              <Copy />
              Копировать текст
            </DropdownMenuItem>
          ) : null}
          {target?.kind === 'link' ? (
            <>
              <DropdownMenuLabel className="max-w-[16rem] truncate">
                {target.external ? 'Внешняя ссылка' : 'Ссылка'}
              </DropdownMenuLabel>
              {target.external ? null : (
                <DropdownMenuItem
                  onSelect={() => router.push(target.href.replace(window.location.origin, ''))}
                >
                  <ArrowRight />
                  Открыть
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onSelect={() => window.open(target.href, '_blank', 'noopener,noreferrer')}
              >
                <ExternalLink />
                Открыть в новой вкладке
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void copy(target.href, 'Ссылка скопирована')}>
                <Link2 />
                Копировать ссылку
              </DropdownMenuItem>
            </>
          ) : null}
          {target?.kind === 'user' ? (
            <>
              <DropdownMenuLabel className="max-w-[16rem] truncate">
                {target.username}
              </DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => void copy(target.username, 'Ник скопирован')}>
                <User />
                Копировать ник
              </DropdownMenuItem>
            </>
          ) : null}
          {target?.kind === 'product' ? (
            <>
              <DropdownMenuLabel className="max-w-[16rem] truncate">
                {target.name}
              </DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => router.push('/shop')}>
                <ShoppingBag />
                Перейти в магазин
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void copy(target.name, 'Название скопировано')}>
                <Copy />
                Копировать название
              </DropdownMenuItem>
            </>
          ) : null}
          {target?.kind === 'image' ? (
            <DropdownMenuLabel>Изображение twomc.su</DropdownMenuLabel>
          ) : null}
          {target && target.kind !== 'page' ? <DropdownMenuSeparator /> : null}
          <DropdownMenuItem onSelect={() => router.back()}>
            <ArrowLeft />
            Назад
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => router.forward()}>
            <ArrowRight />
            Вперёд
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => window.location.reload()}>
            <RotateCw />
            Обновить страницу
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => void copy(window.location.href, 'Адрес страницы скопирован')}
          >
            <Link2 />
            Копировать адрес страницы
          </DropdownMenuItem>
          {canAdmin ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => router.push('/admin')}>
                <LayoutDashboard />
                Админ-панель
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
