import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileHero } from '@/components/profile/profile-hero';
import { floatingClearance } from '@/components/shell/floating-actions';
import { NotificationsPanel } from '@/components/shell/notifications-popover';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useUpdateProfile } from '@/lib/account/hooks';
import { useAuthStore } from '@/lib/auth/store';
import { installFetchMock, jsonResponse, type FetchMock } from '@/test/http';

/// Доработка профиля (ADR-0093): кэш статуса, композиция шапки, метрики гостя,
/// окна из шапки не заходят на плавающие кнопки.

vi.mock('next/navigation', () => ({
  usePathname: () => '/u/steve',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

let client: QueryClient;
function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider delayDuration={0}>{children}</TooltipProvider>
    </QueryClientProvider>
  );
}

let fetchMock: FetchMock;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  fetchMock = installFetchMock();
  useAuthStore.setState({ status: 'authenticated', user: { id: 'u1' } as never });
});
afterEach(() => {
  document.querySelector('[data-testid="floating-actions"]')?.remove();
});

const STATS = { views: 7, likes: 2, dislikes: 1, myReaction: null };

describe('Статус после сохранения профиля', () => {
  it('сохранение обновляет публичный профиль и summary (иначе до минуты виден старый статус)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 'u1', statusText: 'Делаю twomc.su' }));
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useUpdateProfile(), { wrapper: Providers });
    await act(() => result.current.mutateAsync({ statusText: 'Делаю twomc.su' }));
    const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey);
    expect(keys).toContainEqual(['profile', 'public']);
    expect(keys).toContainEqual(['profile', 'summary']);
  });
});

describe('Шапка профиля', () => {
  const hero = (props: Partial<React.ComponentProps<typeof ProfileHero>> = {}) =>
    render(
      <ProfileHero
        handle="steve"
        username="Steve"
        avatar={null}
        banner={null}
        stats={STATS}
        own={false}
        signedIn={false}
        {...props}
      />,
      { wrapper: Providers },
    );

  it('длинный статус — одна строка с многоточием, полный текст в подсказке', () => {
    const long = 'Очень длинный статус '.repeat(8).trim();
    hero({ statusText: long });
    const status = screen.getByTestId('profile-status');
    expect(status).toHaveTextContent(long);
    expect(status).toHaveAttribute('title', long);
    expect(status.className).toMatch(/truncate/);
  });

  it('слот наград пуст, пока наград нет — никаких заглушек', () => {
    hero();
    expect(screen.queryByTestId('profile-awards')).toBeNull();
  });

  it('слот наград — справа снизу identity, когда награды появятся', () => {
    hero({ awards: <span>Награда</span> });
    expect(screen.getByTestId('profile-awards')).toHaveTextContent('Награда');
  });

  it('гость: оценки недоступны (not-allowed), клик ничего не отправляет', async () => {
    hero();
    const metrics = screen.getByTestId('profile-metrics');
    const like = within(metrics).getByRole('button', { name: 'Нравится: 2' });
    expect(like).toHaveAttribute('aria-disabled', 'true');
    expect(like.className).toMatch(/cursor-not-allowed/);
    await userEvent.click(like);
    // Только GET скина для 3D-головы; ни оценки (PUT), ни просмотра (POST).
    const writes = fetchMock.mock.calls.filter(([, init]) => init?.method && init.method !== 'GET');
    expect(writes).toHaveLength(0);
    // Просмотры — только показатель.
    expect(within(metrics).getByLabelText('Просмотров: 7').tagName).toBe('SPAN');
  });
});

describe('Окна из шапки и плавающие кнопки', () => {
  it('нет плавающих кнопок — обычный отступ', () => {
    expect(floatingClearance()).toBe(8);
  });

  it('есть плавающие кнопки — отступ до их верхнего края + зазор', () => {
    const zone = document.createElement('div');
    zone.dataset.testid = 'floating-actions';
    zone.getBoundingClientRect = () => ({ top: window.innerHeight - 124, height: 108 }) as DOMRect;
    document.body.appendChild(zone);
    expect(floatingClearance()).toBe(132);
  });

  it('в окне уведомлений прокручивается только список: шапка и ссылка всегда видны', () => {
    render(
      <NotificationsPanel
        count={0}
        state="ready"
        items={[
          {
            id: 'n1',
            type: 'SYSTEM',
            title: 'Уведомление',
            message: null,
            link: null,
            imageUrl: null,
            priority: 'NORMAL',
            actionUrl: null,
            actionLabel: null,
            isRead: true,
            readAt: null,
            createdAt: new Date().toISOString(),
          },
        ]}
      />,
      { wrapper: Providers },
    );
    const panel = screen.getByTestId('notifications-panel');
    const [header, list, footer] = Array.from(panel.children) as HTMLElement[];
    expect(header!.className).toMatch(/shrink-0/);
    expect(list!.className).toMatch(/overflow-y-auto/);
    expect(list!.className).toMatch(/min-h-0/);
    expect(footer!.className).toMatch(/shrink-0/);
    expect(within(footer!).getByRole('link', { name: 'Все уведомления' })).toBeInTheDocument();
  });
});
