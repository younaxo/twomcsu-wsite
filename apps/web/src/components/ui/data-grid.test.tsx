import { render, screen, within } from '@testing-library/react';
import React from 'react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import { DataGrid, type DataGridColumn } from './data-grid';

interface Row {
  id: string;
  username: string;
  playtime: number;
}

const rows: Row[] = [
  { id: 'u1', username: 'Steve_Mainer', playtime: 412 },
  { id: 'u2', username: 'EnderQueen', playtime: 1280 },
];

const columns: DataGridColumn<Row>[] = [
  { key: 'username', header: 'Ник', cell: (row) => row.username, sortable: true },
  { key: 'playtime', header: 'Часы', cell: (row) => row.playtime, align: 'right' },
];

describe('DataGrid', () => {
  it('рендерит строки и сортировку по клику на заголовок', async () => {
    const onSortChange = vi.fn();
    render(
      <DataGrid
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        sort={null}
        onSortChange={onSortChange}
        caption="Пользователи"
      />,
    );
    expect(screen.getByRole('table', { name: 'Пользователи' })).toBeInTheDocument();
    expect(screen.getByText('EnderQueen')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Ник/ }));
    expect(onSortChange).toHaveBeenCalledWith({ key: 'username', direction: 'asc' });
  });

  it('loading → скелет, пустой список → EmptyState, ошибка → ErrorState с «Повторить»', async () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      <DataGrid columns={columns} rows={[]} getRowId={(row) => row.id} loading />,
    );
    expect(screen.queryByRole('table')).toBeNull();

    rerender(
      <DataGrid
        columns={columns}
        rows={[]}
        getRowId={(row) => row.id}
        emptyTitle="Пока нет пользователей"
      />,
    );
    expect(screen.getByText('Пока нет пользователей')).toBeInTheDocument();

    rerender(
      <DataGrid
        columns={columns}
        rows={[]}
        getRowId={(row) => row.id}
        error={new ApiError(500, ['Внутренняя ошибка сервера'])}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Внутренняя ошибка сервера');
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('выбор строк показывает панель массовых действий и снимает выделение', async () => {
    function Harness() {
      const [selected, setSelected] = React.useState<Set<string>>(new Set());
      return (
        <DataGrid
          columns={columns}
          rows={rows}
          getRowId={(row) => row.id}
          selection={{ selected, onChange: setSelected }}
          bulkActions={<button type="button">Забанить</button>}
        />
      );
    }
    render(<Harness />);
    const user = userEvent.setup();
    expect(screen.queryByRole('region', { name: 'Действия с выбранными строками' })).toBeNull();

    const rowCheckboxes = screen.getAllByRole('checkbox', { name: 'Выбрать строку' });
    await user.click(rowCheckboxes[0]);
    const bar = screen.getByRole('region', { name: 'Действия с выбранными строками' });
    expect(bar).toHaveTextContent('Выбрано: 1');
    expect(within(bar).getByRole('button', { name: 'Забанить' })).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Выбрать все строки на странице' }));
    expect(
      screen.getByRole('region', { name: 'Действия с выбранными строками' }),
    ).toHaveTextContent('Выбрано: 2');

    await user.click(screen.getByRole('button', { name: 'Снять выделение' }));
    expect(screen.queryByRole('region', { name: 'Действия с выбранными строками' })).toBeNull();
  });
});
