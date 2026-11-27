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

function Host({ maxLength }: { maxLength?: number }) {
  const [value, setValue] = useState('');
  return (
    <MentionTextarea
      maxLength={maxLength}
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

  it('постоянные ARIA combobox и live-region, пока список закрыт', () => {
    render(<Host />);
    const field = screen.getByLabelText('Поле');
    expect(field).toHaveAttribute('role', 'combobox');
    expect(field).toHaveAttribute('aria-expanded', 'false');
    expect(field).toHaveAttribute('aria-autocomplete', 'list');
    expect(field.getAttribute('aria-controls')).toBeTruthy();
    expect(field).not.toHaveAttribute('aria-activedescendant');
    expect(screen.getByTestId('mention-status')).toHaveAttribute('aria-live', 'polite');
  });

  it('«ничего не найдено» объявляется в live-region', async () => {
    mocks.get.mockResolvedValue({ items: [], page: 1, limit: 8, hasMore: false });
    render(<Host />);
    await typeAt('@zz');
    expect(screen.getByTestId('mention-status').textContent).toBe('Игроки не найдены.');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('ошибка дублируется в live-region', async () => {
    mocks.get.mockRejectedValue(new Error('boom'));
    render(<Host />);
    await typeAt('@st');
    expect(screen.getByTestId('mention-status').textContent).toBeTruthy();
  });

  it('поздний ответ отменённого запроса игнорируется', async () => {
    const resolvers: Array<(v: unknown) => void> = [];
    mocks.get.mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)));
    render(<Host />);
    await typeAt('@st');
    await typeAt('@ste');
    expect(resolvers).toHaveLength(2);
    await act(async () => {
      resolvers[0]?.(ITEMS);
    });
    expect(screen.queryByRole('listbox')).toBeNull();
    await act(async () => {
      resolvers[1]?.({ ...ITEMS, items: [{ username: 'Steven', tag: null, avatar: null }] });
    });
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option').textContent).toContain('Steven');
  });

  it('в окне debounce Enter и Tab не вставляют устаревший ник', async () => {
    render(<Host />);
    const field = await typeAt('@st');
    expect(screen.getAllByRole('option')).toHaveLength(2);
    fireEvent.change(field, { target: { value: '@ste' } });
    field.setSelectionRange(4, 4);
    fireEvent.select(field);
    // список для прежнего запроса уже не выбираем
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(field).toHaveAttribute('aria-expanded', 'false');
    fireEvent.keyDown(field, { key: 'Tab' });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(field.value).toBe('@ste');
    // Enter без открытого списка уходит родителю (отправка)
    expect(onEnter).toHaveBeenCalledTimes(1);
  });

  it('Esc закрывает только до изменения текста до @; после сброса список открывается снова', async () => {
    render(<Host />);
    let field = await typeAt('@st');
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    // дальнейший ввод в том же токене остаётся закрытым
    field = await typeAt('@ste');
    expect(screen.queryByRole('listbox')).toBeNull();
    // изменение текста до @ сбрасывает закрытие
    field = await typeAt('x @ste');
    expect(screen.getAllByRole('option').length).toBeGreaterThan(0);
  });

  it('после отправки (пустое поле) закрытие сбрасывается', async () => {
    render(<Host />);
    let field = await typeAt('@st');
    fireEvent.keyDown(field, { key: 'Escape' });
    field = await typeAt('', 0);
    field = await typeAt('@st');
    expect(screen.getAllByRole('option').length).toBeGreaterThan(0);
  });

  it('maxLength: вставка, превышающая лимит, не выполняется', async () => {
    render(<Host maxLength={6} />);
    const field = await typeAt('@st');
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(field.value).toBe('@st');
    expect(onEnter).not.toHaveBeenCalled();
    expect(screen.getByTestId('mention-status').textContent).toMatch(/Не хватает места/);
  });

  it('maxLength: вставка, влезающая в лимит, выполняется', async () => {
    render(<Host maxLength={7} />);
    const field = await typeAt('@st');
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(field.value).toBe('@Steve ');
  });

  it('Shift+Enter не выбирает вариант и уходит родителю', async () => {
    render(<Host />);
    const field = await typeAt('@st');
    fireEvent.keyDown(field, { key: 'Enter', shiftKey: true });
    expect(field.value).toBe('@st');
    expect(onEnter).toHaveBeenCalledTimes(1);
  });

  it('IME composition не перехватывается', async () => {
    render(<Host />);
    const field = await typeAt('@st');
    fireEvent.keyDown(field, { key: 'Enter', isComposing: true });
    fireEvent.keyDown(field, { key: 'Tab', keyCode: 229 });
    expect(field.value).toBe('@st');
    expect(onEnter).toHaveBeenCalledTimes(1);
  });

  it('ник с подчёркиванием ищется целиком; точка и дефис токен не продолжают', async () => {
    render(<Host />);
    await typeAt('@Steve_1');
    expect(mocks.get.mock.calls.at(-1)?.[1]).toMatchObject({ query: { q: 'Steve_1' } });
    mocks.get.mockClear();
    await typeAt('@Steve.x');
    await typeAt('@Steve-x');
    expect(mocks.get).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('не показывает ники, не проходящие проверку 3–16 [A-Za-z0-9_]', async () => {
    mocks.get.mockResolvedValue({
      ...ITEMS,
      items: [
        { username: 'Steve', tag: null, avatar: null },
        { username: 'Bad Nick', tag: null, avatar: null },
        { username: 'ab', tag: null, avatar: null },
        { username: 'a'.repeat(17), tag: null, avatar: null },
        { username: 'Ёжик', tag: null, avatar: null },
      ],
    });
    render(<Host />);
    await typeAt('@st');
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]?.textContent).toContain('Steve');
  });

  it('не ищет, если токен длиннее 16 символов', async () => {
    render(<Host />);
    await typeAt(`@${'a'.repeat(16)}`);
    expect(mocks.get).toHaveBeenCalledTimes(1);
    mocks.get.mockClear();
    await typeAt(`@${'a'.repeat(17)}`);
    expect(mocks.get).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('abort при размонтировании во время запроса', async () => {
    const signals: AbortSignal[] = [];
    mocks.get.mockImplementation((_path: string, opts: { signal: AbortSignal }) => {
      signals.push(opts.signal);
      return new Promise(() => {});
    });
    const { unmount } = render(<Host />);
    await typeAt('@st');
    expect(signals).toHaveLength(1);
    expect(signals[0]?.aborted).toBe(false);
    unmount();
    expect(signals[0]?.aborted).toBe(true);
  });
});
