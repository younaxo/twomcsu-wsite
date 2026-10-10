import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/lib/auth/store';
import { MustChangePasswordRedirect } from './must-change-password';

const nav = vi.hoisted(() => ({ pathname: '/', replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
}));

/// Обязательная смена пароля (срез 1.2).
describe('MustChangePasswordRedirect', () => {
  beforeEach(() => {
    nav.replace.mockReset();
    nav.pathname = '/';
  });

  it('аккаунт с mustChangePassword — на «Безопасность»', () => {
    useAuthStore.setState({
      status: 'authenticated',
      user: { id: 'u', mustChangePassword: true } as never,
    });
    render(<MustChangePasswordRedirect />);
    expect(nav.replace).toHaveBeenCalledWith('/settings/security?required=1');
  });

  it('на самой странице и без флага — без перенаправления (нет цикла)', () => {
    useAuthStore.setState({
      status: 'authenticated',
      user: { id: 'u', mustChangePassword: true } as never,
    });
    nav.pathname = '/settings/security';
    render(<MustChangePasswordRedirect />);
    useAuthStore.setState({
      status: 'authenticated',
      user: { id: 'u', mustChangePassword: false } as never,
    });
    nav.pathname = '/';
    render(<MustChangePasswordRedirect />);
    expect(nav.replace).not.toHaveBeenCalled();
  });
});
