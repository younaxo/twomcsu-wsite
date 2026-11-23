import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, getSafeErrorMessage, NetworkError } from '@/lib/api/errors';
import { ErrorState } from './error-state';

const RAW = 'QueryFailedError: relation "orders" does not exist at /srv/api/dist/x.js:12';

describe('ErrorState: безопасный текст по умолчанию', () => {
  it('сырое сообщение API не показывается; есть общий текст, код и «Повторить»', async () => {
    const retry = vi.fn();
    render(
      <ErrorState error={new ApiError(500, [RAW], { code: 'internal_error' })} onRetry={retry} />,
    );
    const alert = screen.getByRole('alert');
    expect(alert).not.toHaveTextContent('QueryFailedError');
    expect(alert).not.toHaveTextContent('/srv/api');
    expect(alert).toHaveTextContent('Сервер временно не отвечает');
    expect(alert).toHaveTextContent('Код ошибки: internal_error');
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('без кода — показывается HTTP-статус; валидация не раскрывает поля', () => {
    render(<ErrorState error={new ApiError(400, ['email must be an email', 'items[0].qty'])} />);
    const alert = screen.getByRole('alert');
    expect(alert).not.toHaveTextContent('email must be');
    expect(alert).toHaveTextContent('Код ошибки: 400');
  });

  it('exposeMessage=true возвращает сообщение API явно', () => {
    render(<ErrorState error={new ApiError(400, ['Нельзя так'])} exposeMessage />);
    expect(screen.getByRole('alert')).toHaveTextContent('Нельзя так');
  });

  it('обычный Error и строка не раскрываются', () => {
    render(<ErrorState error={new Error('TypeError: x is undefined')} />);
    expect(screen.getByRole('alert')).not.toHaveTextContent('TypeError');
  });

  it('явный description важнее и не сопровождается кодом', () => {
    render(<ErrorState error={new ApiError(500, [RAW])} description="Своё описание" />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Своё описание');
    expect(alert).not.toHaveTextContent('Код ошибки');
  });

  it('503 недоступен — отдельный заголовок; сеть — без кода статуса', () => {
    const { unmount } = render(
      <ErrorState
        error={new ApiError(503, [RAW], { code: 'MODULE_DISABLED' })}
        onRetry={() => {}}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Раздел временно недоступен');
    expect(screen.getByRole('alert')).not.toHaveTextContent('QueryFailedError');
    unmount();
    render(<ErrorState error={new NetworkError()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Нет соединения с сервером');
  });

  it('401 — «Войти» вместо «Повторить»', () => {
    render(<ErrorState error={new ApiError(401, ['Unauthorized'])} onRetry={() => {}} />);
    expect(screen.getByRole('alert')).not.toHaveTextContent('Unauthorized');
    expect(screen.getByRole('link', { name: 'Войти' }).getAttribute('href')).toMatch(
      /^\/login\?next=/,
    );
    expect(screen.queryByRole('button', { name: 'Повторить' })).toBeNull();
  });

  it('getSafeErrorMessage не содержит исходных сообщений', () => {
    for (const status of [400, 403, 404, 409, 429, 500, 503]) {
      expect(getSafeErrorMessage(new ApiError(status, [RAW]))).not.toContain('relation');
    }
  });
});
