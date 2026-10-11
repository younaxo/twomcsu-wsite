import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ADMIN_NAV, resolveNavItem, type AdminNavGroup } from '@/lib/admin/navigation';
import { SectionTabs } from './admin-shell';

const nav = vi.hoisted(() => ({ pathname: '/admin/awards' }));
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

function gamification(granted: string[]): AdminNavGroup[] {
  const group = ADMIN_NAV.find((candidate) => candidate.id === 'gamification')!;
  const can = (requirement: unknown) =>
    (Array.isArray(requirement) ? requirement : [requirement]).some((key) =>
      granted.includes(key as string),
    );
  return [{ ...group, items: group.items.map((item) => resolveNavItem(item, can)) }];
}

describe('вкладки подразделов админки (ADR-0139)', () => {
  it('на странице наград — вкладки «Достижения» и «Награды», текущая отмечена', () => {
    nav.pathname = '/admin/awards';
    render(<SectionTabs groups={gamification(['achievements.view', 'awards.view'])} />);
    const tabs = screen.getByRole('navigation', { name: 'Достижения и награды' });
    const links = within(tabs).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(['Достижения', 'Награды']);
    expect(within(tabs).getByRole('link', { name: 'Награды' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(tabs).getByRole('link', { name: 'Достижения' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('доступен один подраздел — вкладок нет', () => {
    nav.pathname = '/admin/awards';
    const { container } = render(<SectionTabs groups={gamification(['awards.view'])} />);
    expect(container).toBeEmptyDOMElement();
  });
});
