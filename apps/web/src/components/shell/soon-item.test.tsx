import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SoonItem } from './soon-item';

describe('SoonItem («Скоро»)', () => {
  it('не ссылка и не кликается: нет href и role=link, есть aria-disabled=true', () => {
    const onClick = vi.fn();
    render(
      <ul>
        <li>
          <SoonItem onClick={onClick}>Wiki</SoonItem>
        </li>
      </ul>,
    );
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    const el = screen.getByText('Wiki').closest('[data-soon]') as HTMLElement;
    expect(el.tagName).toBe('SPAN');
    expect(el).toHaveAttribute('aria-disabled', 'true');
    expect(el).not.toHaveAttribute('href');
    expect(el).not.toHaveAttribute('role');
    expect(el.className).toContain('cursor-not-allowed');
    fireEvent.click(el);
  });

  it('скринридер читает «Скоро»; видимая метка скрыта от AT и отключаема', () => {
    const { rerender } = render(<SoonItem>Wiki</SoonItem>);
    expect(screen.getByText(/— Скоро/)).toHaveClass('sr-only');
    expect(screen.getByText('скоро')).toHaveAttribute('aria-hidden', 'true');
    rerender(<SoonItem badge={false}>Wiki</SoonItem>);
    expect(screen.queryByText('скоро')).toBeNull();
    expect(screen.getByText(/— Скоро/)).toBeInTheDocument();
  });
});
