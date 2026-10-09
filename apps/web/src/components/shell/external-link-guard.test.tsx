import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExternalLinkGuard } from './external-link-guard';

function Page() {
  return (
    <ExternalLinkGuard>
      <a href="/shop">Магазин</a>
      <a href="mailto:support@twomc.su">Почта</a>
      <a href="https://cdn-files.twomc.su/file.png">CDN</a>
      <a href="https://reallyworld.ru/mojang.pdf" target="_blank" rel="noopener noreferrer">
        политике Mojang AB
      </a>
      <a href="https://t.me/twomcsu_support">@twomcsu_support</a>
      <a href="javascript:alert(1)">XSS</a>
    </ExternalLinkGuard>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ExternalLinkGuard', () => {
  it('внешняя ссылка — модалка с hostname и URL; «Перейти» открывает новую вкладку с noopener', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<Page />);
    await user.click(screen.getByRole('link', { name: 'политике Mojang AB' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Вы переходите на внешний сайт');
    expect(dialog).toHaveTextContent('Вы покидаете twomc.su');
    expect(screen.getByTestId('external-link-host')).toHaveTextContent('reallyworld.ru');
    expect(screen.getByTestId('external-link-url')).toHaveTextContent(
      'https://reallyworld.ru/mojang.pdf',
    );
    expect(open).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /Перейти/ }));
    expect(open).toHaveBeenCalledWith(
      'https://reallyworld.ru/mojang.pdf',
      '_blank',
      'noopener,noreferrer',
    );
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('«Отмена» закрывает без перехода; соцсети и Telegram поддержки идут через ту же модалку', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<Page />);
    await user.click(screen.getByRole('link', { name: '@twomcsu_support' }));
    expect(await screen.findByTestId('external-link-host')).toHaveTextContent('t.me');
    await user.click(screen.getByRole('button', { name: 'Отмена' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(open).not.toHaveBeenCalled();
  });

  it('внутренние, mailto и доверенные домены не перехватываются; javascript: блокируется', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<Page />);
    for (const name of ['Магазин', 'Почта', 'CDN', 'XSS']) {
      await user.click(screen.getByRole('link', { name }));
      expect(screen.queryByRole('alertdialog')).toBeNull();
    }
    expect(open).not.toHaveBeenCalled();
  });
});
