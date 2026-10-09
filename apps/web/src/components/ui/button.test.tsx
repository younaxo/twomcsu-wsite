import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button, IconButton } from './button';

describe('Button', () => {
  it('по умолчанию type="button" — не отправляет форму случайно', () => {
    render(<Button>Сохранить изменения</Button>);
    expect(screen.getByRole('button', { name: 'Сохранить изменения' })).toHaveAttribute(
      'type',
      'button',
    );
  });

  it('loading блокирует кнопку, ставит aria-busy и не вызывает onClick', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Отправить
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Отправить' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('asChild рендерит ссылку с классами кнопки', () => {
    render(
      <Button asChild variant="secondary">
        <a href="/admin">В админку</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'В админку' });
    expect(link).toHaveAttribute('href', '/admin');
    expect(link.className).toContain('inline-flex');
    expect(link).not.toHaveAttribute('type');
  });

  it('IconButton требует aria-label и получает квадратный размер', () => {
    render(
      <IconButton aria-label="Закрыть">
        <svg />
      </IconButton>,
    );
    const button = screen.getByRole('button', { name: 'Закрыть' });
    expect(button.className).toContain('size-[var(--control-h)]');
  });

  it('недоступная кнопка: курсор not-allowed (без pointer-events-none), клик не срабатывает', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Отправить
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Отправить' });
    expect(button).toBeDisabled();
    expect(button.className).toContain('disabled:cursor-not-allowed');
    expect(button.className).not.toContain('disabled:pointer-events-none');
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
