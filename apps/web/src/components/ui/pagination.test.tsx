import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { getPaginationRange, Pagination } from './pagination';

describe('getPaginationRange', () => {
  it('до 7 страниц — все номера без многоточий', () => {
    expect(getPaginationRange(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(getPaginationRange(1, 1)).toEqual([1]);
  });

  it('в начале — многоточие только справа, в конце — только слева', () => {
    expect(getPaginationRange(2, 20)).toEqual([1, 2, 3, 4, 5, 'dots-end', 20]);
    expect(getPaginationRange(19, 20)).toEqual([1, 'dots-start', 16, 17, 18, 19, 20]);
  });

  it('в середине — два многоточия и соседи вокруг текущей', () => {
    expect(getPaginationRange(10, 20)).toEqual([1, 'dots-start', 9, 10, 11, 'dots-end', 20]);
  });

  it('страница вне диапазона прижимается к границам', () => {
    expect(getPaginationRange(0, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(getPaginationRange(99, 5)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('Pagination', () => {
  it('навигация с aria-label, текущая страница помечена, кнопки по краям блокируются', async () => {
    const onPageChange = vi.fn();
    render(<Pagination page={1} totalPages={3} onPageChange={onPageChange} />);
    expect(screen.getByRole('navigation', { name: 'Пагинация' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Страница 1' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('button', { name: 'Назад' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Вперёд' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
    await userEvent.click(screen.getByRole('button', { name: 'Страница 3' }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });
});
