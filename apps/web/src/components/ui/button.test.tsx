import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RefreshCw, Send, Upload } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { Button, IconButton, loadingMotionOf } from './button';

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

  it('loading с иконкой — анимируется сама иконка, второго спиннера нет', () => {
    const { rerender } = render(
      <Button>
        <RefreshCw />
        Повторить
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Повторить' });
    const idleIcons = button.querySelectorAll('svg').length;
    rerender(
      <Button loading>
        <RefreshCw />
        Повторить
      </Button>,
    );
    expect(button.querySelectorAll('svg')).toHaveLength(idleIcons);
    expect(button.querySelectorAll('svg')).toHaveLength(1);
    expect(button).toHaveAttribute('data-loading-motion', 'spin');
    // Тот же единственный icon slot — первый дочерний элемент.
    expect(button.firstElementChild?.tagName.toLowerCase()).toBe('svg');
  });

  it('движение по смыслу иконки: refresh — вращение, upload — подъём, send — сдвиг', () => {
    expect(loadingMotionOf('RefreshCw')).toBe('spin');
    expect(loadingMotionOf('RotateCcw')).toBe('spin');
    expect(loadingMotionOf('Upload')).toBe('rise');
    expect(loadingMotionOf('Download')).toBe('drop');
    expect(loadingMotionOf('SendHorizontal')).toBe('nudge');
    expect(loadingMotionOf('Save')).toBe('pulse');
    render(
      <IconButton aria-label="Загрузить" loading>
        <Upload />
      </IconButton>,
    );
    const icon = screen.getByRole('button', { name: 'Загрузить' });
    expect(icon).toHaveAttribute('data-loading-motion', 'rise');
    expect(icon.querySelectorAll('svg')).toHaveLength(1);
  });

  it('loading без иконки — спиннер на месте текста: имя остаётся, ширина не меняется', () => {
    render(<Button loading>Показать ещё</Button>);
    const button = screen.getByRole('button', { name: 'Показать ещё' });
    expect(button.querySelectorAll('svg')).toHaveLength(1);
    expect(button).not.toHaveAttribute('data-loading-motion');
    // Текст остаётся в потоке (прозрачный), спиннер — поверх, абсолютно.
    expect(screen.getByText('Показать ещё').className).toMatch(/opacity-0/);
    expect(button.querySelector('svg')!.parentElement!.className).toMatch(/absolute/);
  });

  it('не в loading — разметка без обёрток и без data-loading-motion', () => {
    render(
      <Button>
        <Send />
        Отправить
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Отправить' });
    expect(button).not.toHaveAttribute('data-loading-motion');
    expect(button.querySelectorAll('svg')).toHaveLength(1);
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
