import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SegmentedControl } from './segmented-control';

const options = [
  { value: 'all', label: 'Все' },
  { value: 'online', label: 'Онлайн' },
  { value: 'banned', label: 'Забаненные', disabled: true },
];

describe('SegmentedControl', () => {
  it('клик выбирает опцию, повторный клик по активной не сбрасывает значение', async () => {
    const onValueChange = vi.fn();
    render(<SegmentedControl options={options} defaultValue="all" onValueChange={onValueChange} />);
    const user = userEvent.setup();
    const online = screen.getByRole('radio', { name: 'Онлайн' });
    await user.click(online);
    expect(onValueChange).toHaveBeenCalledWith('online');
    expect(online).toHaveAttribute('aria-checked', 'true');

    onValueChange.mockClear();
    await user.click(online);
    expect(onValueChange).not.toHaveBeenCalledWith('');
    expect(online).toHaveAttribute('aria-checked', 'true');
  });

  it('disabled-опция недоступна', () => {
    render(<SegmentedControl options={options} defaultValue="all" />);
    expect(screen.getByRole('radio', { name: 'Забаненные' })).toBeDisabled();
  });
});
