import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RetryDialog } from './retry-dialog';

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: vi.fn(), post: vi.fn() },
}));
vi.mock('@/components/ui/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

function setup(serverCheckRequired: boolean) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RetryDialog
        taskId="T1"
        title="VIP"
        serverCheckRequired={serverCheckRequired}
        open
        onOpenChange={vi.fn()}
      />
    </QueryClientProvider>,
  );
  return screen.getByRole('button', { name: 'Повторить выдачу' });
}

describe('RetryDialog: неполная форма', () => {
  it('кнопка disabled, подсказка видна и связана через aria-describedby', async () => {
    const submit = setup(true);
    expect(submit).toBeDisabled();
    const hint = screen.getByTestId('retry-incomplete-hint');
    expect(hint).toBeVisible();
    expect(submit.getAttribute('aria-describedby')).toBe(hint.id);

    await userEvent.click(screen.getByRole('checkbox'));
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByRole('textbox'), 'проверил');
    expect(submit).toBeEnabled();
    expect(screen.queryByTestId('retry-incomplete-hint')).toBeNull();
    expect(submit).not.toHaveAttribute('aria-describedby');
  });

  it('без serverCheckRequired подсказки нет, кнопка активна', () => {
    const submit = setup(false);
    expect(submit).toBeEnabled();
    expect(screen.queryByTestId('retry-incomplete-hint')).toBeNull();
  });
});
