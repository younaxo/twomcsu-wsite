import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PageError from './error';
import NotFound from './not-found';

describe('Страницы ошибок (срез 8.2)', () => {
  it('404: понятный текст и путь на главную', () => {
    render(<NotFound />);
    expect(screen.getByRole('heading', { name: 'Страница не найдена' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'На главную' })).toHaveAttribute('href', '/');
  });

  it('сбой страницы: без текста исключения, «Попробовать снова» вызывает reset', async () => {
    const user = userEvent.setup();
    const reset = vi.fn();
    render(
      <PageError error={new Error('TypeError: x is undefined at /app/page.js:12')} reset={reset} />,
    );
    expect(screen.getByTestId('error-page')).not.toHaveTextContent(/TypeError|page\.js/);
    await user.click(screen.getByRole('button', { name: 'Попробовать снова' }));
    expect(reset).toHaveBeenCalledOnce();
    expect(screen.getByRole('link', { name: 'На главную' })).toHaveAttribute('href', '/');
  });
});
