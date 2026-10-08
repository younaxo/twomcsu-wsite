'use client';

import { Columns3, Inbox } from 'lucide-react';
import { Popover } from 'radix-ui';
import {
  Fragment,
  useEffect,
  useRef,
  type CSSProperties,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import { useIsMobile } from '@/lib/use-media-query';
import { Button } from './button';
import { Card } from './card';
import { EmptyState } from './empty-state';
import { ErrorState } from './error-state';
import { LimitSelect, Pagination, PaginationSummary } from './pagination';
import { SkeletonRows } from './skeleton';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './table';

/// DataGrid — прототип таблицы данных без @tanstack/react-table: колонки,
/// серверная сортировка/пагинация (состояние у вызывающего кода), выбор строк
/// с массовыми действиями, состояния loading/error/empty, карточки на mobile.
/// Когда понадобятся group-by, virtual scroll, resize колонок — заменить на
/// TanStack Table, сохранив этот API.

export interface DataGridColumn<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  sortable?: boolean;
  /// Ширина колонки (px или CSS-значение); при `truncate` ограничивает текст.
  width?: number | string;
  align?: 'left' | 'center' | 'right';
  /// Не показывать в карточках на mobile.
  hideOnMobile?: boolean;
  /// `false` — колонка скрыта (управляется `ColumnVisibilityMenu`).
  visible?: boolean;
  /// Обрезать длинный текст многоточием.
  truncate?: boolean;
}

export interface DataGridSort {
  key: string;
  direction: 'asc' | 'desc';
}

export interface DataGridSelection {
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}

export interface DataGridPagination {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
  onLimitChange?: (limit: number) => void;
}

export interface DataGridProps<T> {
  columns: DataGridColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  sort?: DataGridSort | null;
  /// Цикл по клику на заголовок: asc → desc → без сортировки (`null`).
  onSortChange?: (sort: DataGridSort | null) => void;
  selection?: DataGridSelection;
  /// Кнопки панели «Выбрано N» (удалить, экспортировать…).
  bulkActions?: ReactNode;
  /// Поиск, фильтры, `ColumnVisibilityMenu` — рендерится над таблицей.
  toolbar?: ReactNode;
  pagination?: DataGridPagination;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  /// Своя разметка пустого состояния вместо `EmptyState`.
  empty?: ReactNode;
  emptyTitle?: ReactNode;
  emptyDescription?: ReactNode;
  stickyHeader?: boolean;
  onRowClick?: (row: T) => void;
  /// Подпись таблицы для screen reader (`<caption>`).
  caption?: ReactNode;
  className?: string;
  /// Классы scroll-контейнера таблицы (например `max-h-[60dvh]` для sticky).
  containerClassName?: string;
}

interface SelectCheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  'aria-label': string;
  indeterminate?: boolean;
}

/// Нативный чекбокс с accent-цветом — без зависимости от `checkbox.tsx`.
function SelectCheckbox({ indeterminate = false, className, ...props }: SelectCheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      className={cn(
        'size-4 shrink-0 cursor-pointer rounded-sm accent-primary disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

function activateOnKey<T>(event: KeyboardEvent<T>, action: () => void) {
  if (event.target !== event.currentTarget) {
    return;
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    action();
  }
}

export function DataGrid<T>({
  columns,
  rows,
  getRowId,
  sort = null,
  onSortChange,
  selection,
  bulkActions,
  toolbar,
  pagination,
  loading = false,
  error,
  onRetry,
  empty,
  emptyTitle = 'Ничего не найдено',
  emptyDescription,
  stickyHeader = false,
  onRowClick,
  caption,
  className,
  containerClassName,
}: DataGridProps<T>) {
  const isMobile = useIsMobile();
  const visibleColumns = columns.filter((column) => column.visible !== false);
  const mobileColumns = visibleColumns.filter((column) => !column.hideOnMobile);
  const rowIds = rows.map(getRowId);

  const selectedOnPage = selection ? rowIds.filter((id) => selection.selected.has(id)).length : 0;
  const allSelected = !!selection && rows.length > 0 && selectedOnPage === rows.length;
  const someSelected = selectedOnPage > 0 && !allSelected;

  const toggleAll = () => {
    if (!selection) {
      return;
    }
    const next = new Set(selection.selected);
    rowIds.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
    selection.onChange(next);
  };

  const toggleRow = (id: string) => {
    if (!selection) {
      return;
    }
    const next = new Set(selection.selected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    selection.onChange(next);
  };

  const handleSort = (key: string) => {
    if (!onSortChange) {
      return;
    }
    if (sort?.key !== key) {
      onSortChange({ key, direction: 'asc' });
    } else if (sort.direction === 'asc') {
      onSortChange({ key, direction: 'desc' });
    } else {
      onSortChange(null);
    }
  };

  const hasRows = rows.length > 0;
  const showError = error !== undefined && error !== null && !hasRows;
  const showSkeleton = loading && !hasRows && !showError;
  const showEmpty = !loading && !showError && !hasRows;
  const totalPages = pagination ? Math.max(1, Math.ceil(pagination.total / pagination.limit)) : 1;

  let body: ReactNode;
  if (showError) {
    body = (
      <div className="rounded border bg-surface">
        <ErrorState size="sm" error={error} onRetry={onRetry} retrying={loading} />
      </div>
    );
  } else if (showSkeleton) {
    body = (
      <div className="rounded border bg-surface" aria-busy>
        <SkeletonRows rows={Math.min(pagination?.limit ?? 5, 10)} />
      </div>
    );
  } else if (showEmpty) {
    body = (
      <div className="rounded border bg-surface">
        {empty ?? (
          <EmptyState
            size="sm"
            icon={<Inbox />}
            title={emptyTitle}
            description={emptyDescription}
          />
        )}
      </div>
    );
  } else if (isMobile) {
    body = (
      <div
        role="list"
        aria-busy={loading || undefined}
        className={cn('flex flex-col gap-2', loading && 'opacity-60')}
      >
        {rows.map((row) => {
          const id = getRowId(row);
          const selected = selection?.selected.has(id) ?? false;
          return (
            <Card
              key={id}
              role="listitem"
              variant="flat"
              data-state={selected ? 'selected' : undefined}
              className="flex gap-3 p-4 data-[state=selected]:border-primary/40 data-[state=selected]:bg-primary-soft/40"
            >
              {selection ? (
                <SelectCheckbox
                  aria-label="Выбрать строку"
                  checked={selected}
                  onChange={() => toggleRow(id)}
                  className="mt-0.5"
                />
              ) : null}
              <div
                role={onRowClick ? 'button' : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick ? (event) => activateOnKey(event, () => onRowClick(row)) : undefined
                }
                className={cn('min-w-0 flex-1 rounded-sm', onRowClick && 'cursor-pointer')}
              >
                <dl className="grid grid-cols-[minmax(0,40%)_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
                  {mobileColumns.map((column) => (
                    <Fragment key={column.key}>
                      <dt className="text-xs font-medium leading-5 text-muted-foreground">
                        {column.header}
                      </dt>
                      <dd
                        className={cn(
                          'min-w-0 break-words',
                          column.align === 'right' && 'text-right tabular',
                        )}
                      >
                        {column.cell(row)}
                      </dd>
                    </Fragment>
                  ))}
                </dl>
              </div>
            </Card>
          );
        })}
      </div>
    );
  } else {
    const hasWidths = visibleColumns.some((column) => column.width !== undefined);
    body = (
      <Table
        sticky={stickyHeader}
        containerClassName={containerClassName}
        aria-busy={loading || undefined}
        className={cn(loading && 'opacity-60')}
      >
        {caption ? <TableCaption>{caption}</TableCaption> : null}
        {hasWidths ? (
          <colgroup>
            {selection ? <col className="w-10" /> : null}
            {visibleColumns.map((column) => (
              <col key={column.key} style={{ width: column.width }} />
            ))}
          </colgroup>
        ) : null}
        <TableHeader>
          <TableRow>
            {selection ? (
              <TableHead className="w-10">
                <SelectCheckbox
                  aria-label="Выбрать все строки на странице"
                  checked={allSelected}
                  indeterminate={someSelected}
                  disabled={rows.length === 0}
                  onChange={toggleAll}
                  className="block"
                />
              </TableHead>
            ) : null}
            {visibleColumns.map((column) => (
              <TableHead
                key={column.key}
                sortable={!!column.sortable && !!onSortChange}
                sortDirection={sort?.key === column.key ? sort.direction : null}
                onSort={() => handleSort(column.key)}
                numeric={column.align === 'right'}
                className={cn(column.align === 'center' && 'text-center')}
              >
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const id = getRowId(row);
            const selected = selection?.selected.has(id) ?? false;
            return (
              <TableRow
                key={id}
                selected={selected}
                tabIndex={onRowClick ? 0 : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick ? (event) => activateOnKey(event, () => onRowClick(row)) : undefined
                }
                className={cn(onRowClick && 'cursor-pointer')}
              >
                {selection ? (
                  <TableCell className="w-10" onClick={(event) => event.stopPropagation()}>
                    <SelectCheckbox
                      aria-label="Выбрать строку"
                      checked={selected}
                      onChange={() => toggleRow(id)}
                      className="block"
                    />
                  </TableCell>
                ) : null}
                {visibleColumns.map((column) => (
                  <TableCell
                    key={column.key}
                    numeric={column.align === 'right'}
                    truncate={column.truncate}
                    className={cn('min-w-0', column.align === 'center' && 'text-center')}
                    style={
                      column.width !== undefined
                        ? ({
                            '--cell-max-w':
                              typeof column.width === 'number' ? `${column.width}px` : column.width,
                          } as CSSProperties)
                        : undefined
                    }
                  >
                    {column.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  }

  return (
    <div className={cn('flex min-w-0 flex-col gap-3', className)}>
      {toolbar ? <div className="flex flex-wrap items-center gap-2">{toolbar}</div> : null}
      {selection && selection.selected.size > 0 ? (
        <div
          role="region"
          aria-label="Действия с выбранными строками"
          className="flex flex-wrap items-center gap-2 rounded border border-primary/30 bg-primary-soft/60 px-3 py-2 text-sm animate-fade-in"
        >
          <span aria-live="polite" className="font-medium tabular">
            Выбрано: {formatNumber(selection.selected.size)}
          </span>
          <Button variant="ghost" size="sm" onClick={() => selection.onChange(new Set())}>
            Снять выделение
          </Button>
          {bulkActions ? (
            <div className="ml-auto flex flex-wrap items-center gap-2">{bulkActions}</div>
          ) : null}
        </div>
      ) : null}
      {body}
      {pagination ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <PaginationSummary
              page={pagination.page}
              limit={pagination.limit}
              total={pagination.total}
            />
            {pagination.onLimitChange ? (
              <LimitSelect value={pagination.limit} onChange={pagination.onLimitChange} />
            ) : null}
          </div>
          <Pagination
            size="sm"
            page={pagination.page}
            totalPages={totalPages}
            onPageChange={pagination.onPageChange}
            className="self-end sm:self-auto"
          />
        </div>
      ) : null}
    </div>
  );
}

export interface ColumnVisibilityMenuProps {
  columns: { key: string; label: ReactNode }[];
  /// Ключи скрытых колонок; вызывающий код мапит в `column.visible`.
  hidden: Set<string>;
  onHiddenChange: (next: Set<string>) => void;
  label?: string;
}

/// Кнопка «Колонки» с нативными чекбоксами в Popover — для `toolbar` DataGrid.
export function ColumnVisibilityMenu({
  columns,
  hidden,
  onHiddenChange,
  label = 'Колонки',
}: ColumnVisibilityMenuProps) {
  const toggle = (key: string) => {
    const next = new Set(hidden);
    if (next.has(key)) {
      next.delete(key);
    } else if (next.size < columns.length - 1) {
      // Последнюю видимую колонку скрыть нельзя — таблица станет пустой.
      next.add(key);
    }
    onHiddenChange(next);
  };
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button variant="secondary" size="sm">
          <Columns3 aria-hidden />
          {label}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            'z-50 w-56 max-w-[calc(100vw-2rem)] overscroll-contain p-1.5',
            'rounded-lg glass-frosted text-foreground',
            'data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out',
            'data-[side=top]:[--pop-y:4px] data-[side=bottom]:[--pop-y:-4px]',
          )}
        >
          <p className="px-2 py-1 text-xs font-medium text-muted-foreground">Показывать колонки</p>
          <ul className="flex max-h-72 flex-col overflow-y-auto scrollbar-thin">
            {columns.map((column) => (
              <li key={column.key}>
                <label className="flex h-control-sm cursor-pointer items-center gap-2 rounded px-2 text-sm hover:bg-muted">
                  <input
                    type="checkbox"
                    checked={!hidden.has(column.key)}
                    onChange={() => toggle(column.key)}
                    className="size-4 shrink-0 cursor-pointer rounded-sm accent-primary"
                  />
                  <span className="min-w-0 truncate">{column.label}</span>
                </label>
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
