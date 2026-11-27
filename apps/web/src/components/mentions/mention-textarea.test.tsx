import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MentionTextarea } from './mention-textarea';

const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { get: mocks.get },
}));

const onEnter = vi.fn();

function Host() {
  const [value, setValue] = useState('');
  return (
    <MentionTextarea
      aria-label="Поле"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onEnter();
      }}
    />
  );
}

const ITEMS = {
  items: [
    { username: 'Steve', tag: 'ADM', avatar: null },
    { username: 'Stella', tag: null, avatar: null },
    { username: 'Ghost', tag: null, avatar: null, hidden: true },
  ],
  page: 1,
  limit: 8,
  hasMore: false,
};

/// Печатает текст с курсором в позиции caret (по умолчанию в конце) и ждёт debounce.
async function typeAt(text: string, caret = text.length) {
  const field = screen.getByLabelText('Поле') as HTMLTextAreaElement;
  fireEvent.change(field, { target: { value: text } });
  field.setSelectionRange(caret, caret);
  fireEvent.select(field);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(260);
  });
  return field;
}

describe('MentionTextarea', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.get.mockReset();
    mocks.get.mockResolvedValue(ITEMS);
    onEnter.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('не ищет по одному символу и до задержки', async () => {
    render(<Host />);
    await typeAt('@s');
    expect(mocks.get).not.toHaveBeenCalled();
    const field = screen.getByLabelText('Поле');
    fireEvent.change(field, { target: { value: '@st' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('показывает список с ARIA и фильтрует скрытых', async () => {
    render(<Host />);
    const field = await typeAt('@st');
    expect(mocks.get).toHaveBeenCalledTimes(1);
    expect(mocks.get.mock.calls[0]?.[1]).toMatchObject({ query: { q: 'st' } });
    const listbox = screen.getByRole('listbox');
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);
    expect(field).toHaveAttribute('role', 'combobox');
    expect(field).toHaveAttribute('aria-expanded', 'true');
    expect(field).toHaveAttribute('aria-controls', listbox.id);
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(field).toHaveAttribute('aria-activedescendant', options[0]?.id);
  });

  it('стрелки двигают выбор, Enter вставляет ник и не доходит до родителя', async () => {
    render(<Host />);
    const field = await typeAt('hi @st');
    fireEvent.keyDown(field, { key: 'ArrowDown' });
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onEnter).not.toHaveBeenCalled();
    expect(field.value).toBe('hi @Stella ');
    expect(field.selectionStart).toBe(11);
    expect(document.activeElement).toBe(field);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('Esc закрывает список без вставки', async () => {
    render(<Host />);
    const field = await typeAt('@st');
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(field.value).toBe('@st');
  });

  it('Tab вставляет в позицию курсора в середине текста', async () => {
    render(<Host />);
    const field = await typeAt('a @st tail', 5);
    fireEvent.keyDown(field, { key: 'Tab' });
    expect(field.value).toBe('a @Steve tail');
    expect(field.selectionStart).toBe(9);
  });

  it('когда список закрыт, Enter уходит родителю', async () => {
    render(<Host />);
    const field = await typeAt('просто текст');
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onEnter).toHaveBeenCalledTimes(1);
  });

  it('отменяет устаревший запрос', async () => {
    const signals: AbortSignal[] = [];
    mocks.get.mockImplementation((_path: string, opts: { signal: AbortSignal }) => {
      signals.push(opts.signal);
      return new Promise(() => {});
    });
    render(<Host />);
    await typeAt('@st');
    await typeAt('@ste');
    expect(signals).toHaveLength(2);
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);
  });

  it('ошибка API показывается без сырого текста', async () => {
    mocks.get.mockRejectedValue(new Error('SELECT * FROM users'));
    render(<Host />);
    await typeAt('@st');
    const box = screen.getByRole('listbox');
    expect(box.textContent).not.toMatch(/SELECT/);
    expect(box.textContent).toBeTruthy();
  });

  it('клик по варианту вставляет ник', async () => {
    render(<Host />);
    const field = await typeAt('@st');
    fireEvent.mouseDown(screen.getAllByRole('option')[0] as HTMLElement);
    expect(field.value).toBe('@Steve ');
  });
});
