import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Emoji, emojiSrc } from './emoji';

describe('Apple Emoji Policy (A15)', () => {
  it('из пака — картинка по коду Unicode с подписью; без пака — без системного emoji', () => {
    expect(emojiSrc('fire', 'https://cdn.example/emoji/')).toBe('https://cdn.example/emoji/1f525.png');
    const { unmount } = render(<Emoji name="fire" base="https://cdn.example/emoji" />);
    expect(screen.getByRole('img', { name: 'огонь' })).toHaveAttribute(
      'src',
      'https://cdn.example/emoji/1f525.png',
    );
    unmount();
    const { container } = render(<Emoji name="fire" base="" />);
    // Нет пака — ни <img>, ни символа emoji шрифтом ОС; только подпись.
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('огонь');
    expect(container.innerHTML).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
