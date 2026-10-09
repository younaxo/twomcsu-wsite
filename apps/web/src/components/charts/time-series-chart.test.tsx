import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TimeSeriesChart } from './time-series-chart';

describe('TimeSeriesChart', () => {
  it('подпись для screen reader с итогами за период; пустые данные — честное состояние', () => {
    const { unmount } = render(
      <TimeSeriesChart
        ariaLabel="Регистрации по дням"
        data={[
          { day: '2026-10-08', registrations: 3 },
          { day: '2026-10-09', registrations: 4 },
        ]}
        series={[{ key: 'registrations', label: 'Регистрации', color: 'rgb(var(--primary))' }]}
      />,
    );
    expect(screen.getByTestId('time-series-chart')).toHaveTextContent(
      'Регистрации по дням. За период — Регистрации: 7.',
    );
    unmount();
    render(
      <TimeSeriesChart
        ariaLabel="Пусто"
        data={[]}
        series={[{ key: 'registrations', label: 'Регистрации', color: 'red' }]}
      />,
    );
    expect(screen.getByText('Данных за период нет.')).toBeInTheDocument();
  });
});
