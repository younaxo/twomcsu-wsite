import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DatePicker } from './date-picker';

function Harness({
  initial = '2026-03-15',
  onChange,
  min,
  max,
}: {
  initial?: string | null;
  onChange?: (value: string | null) => void;
  min?: string;
  max?: string;
}) {
  const [value, setValue] = useState<string | null>(initial);
  return (
    <DatePicker
      aria-label="Дата"
      value={value}
      min={min}
      max={max}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

describe('DatePicker — виды день / месяц / год', () => {
  it('заголовок → месяцы → годы; выбор года и месяца возвращает к дням; выбор дня', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Дата' }));
    const heading = screen.getByTestId('date-picker-heading');
    expect(heading).toHaveTextContent('Март 2026');

    await user.click(heading);
    const months = screen.getByTestId('date-picker-months');
    expect(within(months).getByRole('button', { name: 'Март 2026' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(screen.getByTestId('date-picker-heading'));
    const years = screen.getByTestId('date-picker-years');
    expect(within(years).getByRole('button', { name: '2026' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(within(years).getByRole('button', { name: '2030' }));
    expect(screen.getByTestId('date-picker-heading')).toHaveTextContent('2030');
    await user.click(
      within(screen.getByTestId('date-picker-months')).getByRole('button', {
        name: 'Октябрь 2030',
      }),
    );
    expect(screen.getByTestId('date-picker-heading')).toHaveTextContent('Октябрь 2030');
    await user.click(screen.getByRole('button', { name: /(^|\s)7 октября 2030/ }));
    expect(onChange).toHaveBeenCalledWith('2030-10-07');
  });

  it('месяцы и годы вне min/max недоступны; листание годов страницами', async () => {
    const user = userEvent.setup();
    render(<Harness min="2026-02-10" max="2027-05-01" />);
    await user.click(screen.getByRole('button', { name: 'Дата' }));
    await user.click(screen.getByTestId('date-picker-heading'));
    const months = screen.getByTestId('date-picker-months');
    expect(within(months).getByRole('button', { name: 'Январь 2026' })).toBeDisabled();
    expect(within(months).getByRole('button', { name: 'Февраль 2026' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Предыдущий год' })).toBeDisabled();
    await user.click(screen.getByTestId('date-picker-heading'));
    const years = screen.getByTestId('date-picker-years');
    expect(within(years).getByRole('button', { name: '2025' })).toBeDisabled();
    expect(within(years).getByRole('button', { name: '2028' })).toBeDisabled();
    expect(within(years).getByRole('button', { name: '2027' })).toBeEnabled();
  });

  it('клавиатура в сетке месяцев: стрелки переводят фокус', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Дата' }));
    await user.click(screen.getByTestId('date-picker-heading'));
    const months = screen.getByTestId('date-picker-months');
    within(months).getByRole('button', { name: 'Март 2026' }).focus();
    await user.keyboard('{ArrowDown}');
    expect(within(months).getByRole('button', { name: 'Июнь 2026' })).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(within(months).getByRole('button', { name: 'Май 2026' })).toHaveFocus();
  });
});
