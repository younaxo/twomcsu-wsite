import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/lib/auth/store';
import { resolveContextTarget, SiteContextMenu } from './site-context-menu';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), forward: vi.fn() }),
}));

const ORIGIN = 'http://localhost:3000';

function dom(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

describe('resolveContextTarget', () => {
  it('приоритет: поле ввода → нативное, выделение, сущность, ссылка, изображение, страница', () => {
    const root = dom(`
      <input id="in" />
      <div data-context="product" data-context-name="Набор Лорда"><img id="pimg" data-context="image" /></div>
      <span id="u" data-context="user" data-context-username="younaxo_">younaxo_</span>
      <a id="int" href="/shop">Магазин</a>
      <a id="ext" href="https://example.com">x</a>
      <img id="img" /><p id="p">текст</p>`);
    const q = (id: string) => root.querySelector(`#${id}`);
    expect(resolveContextTarget(q('in'), '', ORIGIN)).toBeNull();
    expect(resolveContextTarget(q('p'), 'выделено', ORIGIN)).toEqual({
      kind: 'selection',
      text: 'выделено',
    });
    expect(resolveContextTarget(q('pimg'), '', ORIGIN)).toEqual({
      kind: 'product',
      name: 'Набор Лорда',
    });
    expect(resolveContextTarget(q('u'), '', ORIGIN)).toEqual({
      kind: 'user',
      username: 'younaxo_',
    });
    expect(resolveContextTarget(q('int'), '', ORIGIN)).toMatchObject({
      kind: 'link',
      external: false,
    });
    expect(resolveContextTarget(q('ext'), '', ORIGIN)).toMatchObject({
      kind: 'link',
      external: true,
    });
    expect(resolveContextTarget(q('img'), '', ORIGIN)).toEqual({ kind: 'image', protected: false });
    expect(resolveContextTarget(q('p'), '', ORIGIN)).toEqual({ kind: 'page' });
    root.remove();
  });
});

describe('SiteContextMenu', () => {
  beforeEach(() => {
    useAuthStore.setState({ status: 'anonymous', user: null });
    window.matchMedia = ((query: string) => ({
      matches: query === '(pointer: fine)',
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
  });

  it('ПКМ по нику — меню у курсора с «Копировать ник»; Shift+ПКМ — нативное', async () => {
    render(
      <SiteContextMenu>
        <span data-testid="nick" data-context="user" data-context-username="younaxo_">
          younaxo_
        </span>
      </SiteContextMenu>,
    );
    const shift = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      shiftKey: true,
    });
    act(() => {
      screen.getByTestId('nick').dispatchEvent(shift);
    });
    expect(shift.defaultPrevented).toBe(false);
    fireEvent.contextMenu(screen.getByTestId('nick'), { clientX: 120, clientY: 80 });
    expect(await screen.findByRole('menuitem', { name: 'Копировать ник' })).toBeInTheDocument();
    expect(screen.getByTestId('context-menu-anchor')).toHaveStyle({ left: '120px', top: '80px' });
    // Без прав администратора пункта «Админ-панель» нет.
    expect(screen.queryByRole('menuitem', { name: 'Админ-панель' })).toBeNull();
  });

  it('свои меню компонентов (событие уже обработано) не перехватываются', () => {
    render(
      <SiteContextMenu>
        <div data-testid="own" onContextMenu={(event) => event.preventDefault()}>
          своё меню
        </div>
      </SiteContextMenu>,
    );
    fireEvent.contextMenu(screen.getByTestId('own'));
    expect(screen.queryByTestId('site-context-menu')).toBeNull();
  });

  it('пункт «Админ-панель» — только с правом входа в админку', async () => {
    const user = userEvent.setup();
    useAuthStore.setState({
      status: 'authenticated',
      user: { permissions: { superuser: true, permissions: [], maxPriority: 100 } } as never,
    });
    render(
      <SiteContextMenu>
        <p data-testid="page">страница</p>
      </SiteContextMenu>,
    );
    fireEvent.contextMenu(screen.getByTestId('page'));
    expect(await screen.findByRole('menuitem', { name: 'Админ-панель' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
  });
});
