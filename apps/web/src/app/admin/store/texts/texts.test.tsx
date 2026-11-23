import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StoreTextsSection } from '@/components/store/store-texts';
import { ApiError } from '@/lib/api/errors';
import StoreTextsPage from './page';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  granted: new Set<string>(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get, put: mocks.put },
}));
vi.mock('@/lib/auth/use-permissions', () => ({
  usePermissions: () => ({
    can: (requirement: string | string[]) =>
      (Array.isArray(requirement) ? requirement : [requirement]).some((key) =>
        mocks.granted.has(key),
      ),
  }),
}));
vi.mock('@/components/ui/toast', () => ({ toast: mocks.toast }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/store/texts',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const EMPTY = {
  'store.text.shop_intro': '',
  'store.text.unban_rules': '',
  'store.text.unmute_rules': '',
  'store.text.refund_policy': '',
  'store.text.perk_descriptions': '',
  'store.text.checkout_notice': '',
};

function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mocks.granted.clear();
  mocks.get.mockReset();
  mocks.put.mockReset();
  for (const fn of Object.values(mocks.toast)) fn.mockReset();
  mocks.get.mockResolvedValue(EMPTY);
});

describe('админка «Тексты магазина»', () => {
  it('без права store.settings.manage — 403, запросов нет', () => {
    render(<StoreTextsPage />, { wrapper: Providers });
    expect(screen.getByText(/store\.settings\.manage/)).toBeInTheDocument();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('предупреждение про перки и счётчик длины', async () => {
    mocks.granted.add('store.settings.manage');
    render(<StoreTextsPage />, { wrapper: Providers });
    expect(await screen.findByTestId('perks-warning')).toHaveTextContent(
      'Не обещайте перков, которых нет в игре',
    );
    expect(screen.getByLabelText('Правила снятия банов')).toBeVisible();
    expect(screen.getAllByText(/0 из 4000 символов/).length).toBeGreaterThan(0);
  });

  it('контроль длины на клиенте: запрос не уходит', async () => {
    mocks.granted.add('store.settings.manage');
    const user = userEvent.setup();
    render(<StoreTextsPage />, { wrapper: Providers });
    const field = await screen.findByLabelText('Вступление магазина');
    await user.click(field);
    await user.paste('я'.repeat(2001));
    await user.click(screen.getByRole('button', { name: 'Сохранить тексты' }));
    expect(screen.getByText(/Слишком длинный текст: 2001 из 2000/)).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent('Исправьте ошибки');
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it('сохраняет только изменённые ключи', async () => {
    mocks.granted.add('store.settings.manage');
    mocks.put.mockResolvedValue({ ...EMPTY, 'store.text.refund_policy': 'Возврат в 3 дня' });
    const user = userEvent.setup();
    render(<StoreTextsPage />, { wrapper: Providers });
    await user.type(await screen.findByLabelText('Политика возвратов'), 'Возврат в 3 дня');
    await user.click(screen.getByRole('button', { name: 'Сохранить тексты' }));
    await waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(1));
    expect(mocks.put).toHaveBeenCalledWith('/admin/store/settings', {
      values: { 'store.text.refund_policy': 'Возврат в 3 дня' },
    });
  });

  it('серверный код setting_too_long -> русский текст в role=alert', async () => {
    mocks.granted.add('store.settings.manage');
    mocks.put.mockRejectedValue(new ApiError(400, ['x'], { code: 'setting_too_long' }));
    const user = userEvent.setup();
    render(<StoreTextsPage />, { wrapper: Providers });
    await user.type(await screen.findByLabelText('Политика возвратов'), 'abc');
    await user.click(screen.getByRole('button', { name: 'Сохранить тексты' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Один из текстов длиннее допустимого.',
    );
  });
});

describe('публичные тексты магазина', () => {
  it('пустые значения — честные пустые состояния', async () => {
    mocks.get.mockResolvedValue(EMPTY);
    render(<StoreTextsSection />, { wrapper: Providers });
    expect(await screen.findByText('Правила снятия банов пока не опубликованы.')).toBeVisible();
    expect(screen.getByText('Политика возвратов пока не опубликована.')).toBeVisible();
    expect(screen.getByText('Описания перков пока не опубликованы.')).toBeVisible();
  });

  it('HTML отображается как текст, переносы — через CSS', async () => {
    mocks.get.mockResolvedValue({
      ...EMPTY,
      'store.text.unban_rules': '<img src=x onerror=alert(1)>\nвторая строка <b>жирный</b>',
    });
    const { container } = render(<StoreTextsSection />, { wrapper: Providers });
    const text = await screen.findByText(/onerror=alert\(1\)/);
    expect(text.textContent).toContain('<b>жирный</b>');
    expect(text.className).toContain('whitespace-pre-line');
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
  });

  it('ошибка загрузки не ломает страницу', async () => {
    mocks.get.mockRejectedValue(new ApiError(500, ['boom']));
    render(<StoreTextsSection />, { wrapper: Providers });
    expect(await screen.findByText(/Не удалось загрузить правила/)).toBeVisible();
  });
});
