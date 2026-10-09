import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/lib/theme/theme-provider';
import { THEME_INIT_SCRIPT } from '@/lib/theme/theme';
import { ProfileTrigger } from '@/components/shell/profile-trigger';
import { ConfirmDialog } from './alert-dialog';
import { Checkbox } from './checkbox';
import { DataGrid, type DataGridColumn } from './data-grid';
import { Dialog, DialogContent, DialogTitle } from './dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './dropdown-menu';
import { LimitSelect } from './pagination';
import { ThemeToggle } from './theme-toggle';
import { Tooltip, TooltipProvider } from './tooltip';

describe('LimitSelect — Radix Select вместо нативного', () => {
  it('нет <select>; открывается в Portal, выбор меняет размер страницы, Escape закрывает', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(<LimitSelect value={20} onChange={onChange} />);
    expect(container.querySelector('select')).toBeNull();
    const trigger = screen.getByRole('combobox', { name: 'Строк на странице' });
    expect(trigger).toHaveTextContent('20');

    await user.click(trigger);
    const listbox = await screen.findByRole('listbox');
    expect(container.contains(listbox)).toBe(false); // Portal
    const selected = within(listbox).getByRole('option', { name: '20' });
    expect(selected).toHaveAttribute('aria-selected', 'true');
    expect(selected.className).toMatch(/data-\[state=checked\]:text-primary/);
    await user.click(within(listbox).getByRole('option', { name: '50' }));
    expect(onChange).toHaveBeenCalledWith(50);

    await user.click(trigger);
    await screen.findByRole('listbox');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});

interface Row {
  id: string;
  name: string;
}
const rows: Row[] = [
  { id: 'a', name: 'Alpha' },
  { id: 'b', name: 'Beta' },
];
const columns: DataGridColumn<Row>[] = [{ key: 'name', header: 'Имя', cell: (row) => row.name }];

function SelectableGrid() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  return (
    <DataGrid
      columns={columns}
      rows={rows}
      getRowId={(row) => row.id}
      caption="Тестовая таблица"
      description="Описание над таблицей"
      selection={{ selected, onChange: setSelected }}
      pagination={{ page: 1, limit: 20, total: 2, onPageChange: () => {}, onLimitChange: () => {} }}
    />
  );
}

describe('DataGrid — описание, footer, выбор строк', () => {
  it('описание над таблицей, footer отделён линией, один LimitSelect', () => {
    render(<SelectableGrid />);
    const description = screen.getByTestId('data-grid-description');
    const table = screen.getByRole('table', { name: 'Тестовая таблица' });
    expect(table).toHaveAttribute('aria-describedby', description.id);
    // Описание идёт раньше таблицы в документе.
    expect(
      description.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const footer = screen.getByTestId('data-grid-footer');
    expect(footer.className).toMatch(/border-t/);
    expect(footer.className).toMatch(/grid-cols-\[minmax\(0,1fr\)_auto\]/);
    expect(footer.className).toMatch(/md:flex/);
    expect(within(footer).getAllByTestId('limit-select')).toHaveLength(1);
    expect(within(footer).getByText('1–2 из 2')).toBeInTheDocument();
  });

  it('чекбоксы — общий Checkbox (не нативный), select-all и indeterminate', async () => {
    const user = userEvent.setup();
    const { container } = render(<SelectableGrid />);
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    const all = screen.getByRole('checkbox', { name: 'Выбрать все строки на странице' });
    const [first] = screen.getAllByRole('checkbox', { name: 'Выбрать строку' });
    expect(first).toHaveAttribute('aria-checked', 'false');
    await user.click(first);
    expect(first).toHaveAttribute('aria-checked', 'true');
    expect(all).toHaveAttribute('aria-checked', 'mixed');
    await user.click(all);
    for (const row of screen.getAllByRole('checkbox', { name: 'Выбрать строку' })) {
      expect(row).toHaveAttribute('aria-checked', 'true');
    }
  });
});

describe('Checkbox', () => {
  it('кастомный unchecked/checked/disabled, Space переключает, focus-visible', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Checkbox aria-label="Согласие" />
        <Checkbox aria-label="Отключён" disabled defaultChecked />
      </>,
    );
    const box = screen.getByRole('checkbox', { name: 'Согласие' });
    expect(box.tagName).toBe('BUTTON');
    expect(box.className).toMatch(/border-border-strong/);
    expect(box.className).toMatch(/focus-visible:ring-2/);
    box.focus();
    await user.keyboard(' ');
    expect(box).toHaveAttribute('aria-checked', 'true');
    expect(box.className).toMatch(/data-\[state=checked\]:bg-primary/);
    const disabled = screen.getByRole('checkbox', { name: 'Отключён' });
    expect(disabled).toBeDisabled();
    expect(disabled).toHaveAttribute('aria-checked', 'true');
  });
});

describe('Диалоги — единое закрытие', () => {
  it('Dialog: тёмный scrim, крестик, Escape закрывает', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>Окно</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    expect(document.querySelector('.bg-scrim')).not.toBeNull();
    expect(document.querySelector('.bg-foreground\\/40')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Закрыть' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    onOpenChange.mockClear();
    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('ConfirmDialog: крестик, клик по подложке и Escape = «Отмена»; фокус на «Отмене»', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Снять роль?"
        onConfirm={onConfirm}
        destructive
      />,
    );
    const dialog = screen.getByRole('alertdialog');
    expect(screen.getByRole('button', { name: 'Отмена' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Закрыть' }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    onOpenChange.mockClear();

    const overlay = document.querySelector('.bg-scrim') as HTMLElement;
    fireEvent.click(overlay);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    onOpenChange.mockClear();

    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe('Тема', () => {
  it('без сохранённого выбора init-скрипт берёт тему ОС (System по умолчанию)', () => {
    const original = window.matchMedia;
    localStorage.removeItem('twomc.theme.v1');
    window.matchMedia = ((query: string) => ({
      matches: query.includes('dark') ? false : true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    new Function(THEME_INIT_SCRIPT)();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    localStorage.setItem('twomc.theme.v1', 'dark');
    new Function(THEME_INIT_SCRIPT)();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    localStorage.removeItem('twomc.theme.v1');
    window.matchMedia = original;
  });

  it('переключатель: Системная / Тёмная / Светлая, видно фактическую тему', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <TooltipProvider>
          <ThemeToggle />
        </TooltipProvider>
      </ThemeProvider>,
    );
    const trigger = screen.getByRole('button', { name: /Сменить тему/ });
    expect(trigger).toHaveAttribute('data-theme-preference', 'system');
    await user.click(trigger);
    const items = await screen.findAllByRole('menuitemradio');
    expect(items.map((item) => item.textContent?.replace(/(тёмная|светлая)$/, ''))).toEqual([
      'Системная',
      'Тёмная',
      'Светлая',
    ]);
    expect(items[0]).toHaveAttribute('aria-checked', 'true');
  });
});

describe('ProfileTrigger', () => {
  it('chevron aria-hidden, aria-expanded/haspopup от Trigger, поворот в открытом состоянии', async () => {
    const user = userEvent.setup();
    // Как в админке: Tooltip поверх Trigger перезаписывает data-state —
    // поворот завязан на aria-expanded.
    render(
      <TooltipProvider>
        <DropdownMenu>
          <Tooltip content="Аккаунт">
            <DropdownMenuTrigger asChild>
              <ProfileTrigger username="younaxo_" aria-label="Профиль: younaxo_" />
            </DropdownMenuTrigger>
          </Tooltip>
          <DropdownMenuContent>
            <DropdownMenuItem>Выйти</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TooltipProvider>,
    );
    const trigger = screen.getByRole('button', { name: 'Профиль: younaxo_' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    const chevron = trigger.querySelector('svg.lucide-chevron-down');
    expect(chevron).toHaveAttribute('aria-hidden', 'true');
    expect(chevron?.getAttribute('class')).toMatch(/group-aria-expanded\/profile:rotate-180/);
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });
});
