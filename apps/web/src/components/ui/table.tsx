import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import {
  forwardRef,
  type HTMLAttributes,
  type TableHTMLAttributes,
  type TdHTMLAttributes,
  type ThHTMLAttributes,
} from 'react';
import { cn } from '@/lib/cn';

/// Table — семантическая таблица данных (списки игроков, логи, транзакции).
/// Server-safe: без состояния и Radix. Единственная клиентская часть —
/// кнопка сортировки в `TableHead` (`sortable` + `onSort`), её рендерят
/// только из клиентских компонентов. Выбор строк, пагинация, карточки на
/// mobile — в `DataGrid`.

export type SortDirection = 'asc' | 'desc' | null;

export interface TableProps extends TableHTMLAttributes<HTMLTableElement> {
  /// Прилипающий `<thead>` при вертикальном скролле. Контейнеру нужна
  /// ограниченная высота — задаётся через `containerClassName` (`max-h-96`).
  sticky?: boolean;
  /// Классы scroll-контейнера (высота, скругление, фон).
  containerClassName?: string;
}

export const Table = forwardRef<HTMLTableElement, TableProps>(
  ({ className, sticky = false, containerClassName, ...props }, ref) => (
    <div
      className={cn(
        'relative w-full overflow-x-auto overscroll-x-contain rounded border bg-surface scrollbar-thin',
        containerClassName,
      )}
    >
      <table
        ref={ref}
        className={cn(
          'w-full caption-bottom border-collapse text-sm',
          sticky && [
            '[&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10 [&_thead]:bg-surface',
            // border-collapse не рисует границу у sticky-шапки — рисуем тенью по токену.
            '[&_thead]:shadow-[inset_0_-1px_0_0_rgb(var(--border))]',
          ],
          className,
        )}
        {...props}
      />
    </div>
  ),
);
Table.displayName = 'Table';

export const TableHeader = forwardRef<
  HTMLTableSectionElement,
  HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn('[&_tr]:border-b [&_tr]:border-border [&_tr:hover]:bg-transparent', className)}
    {...props}
  />
));
TableHeader.displayName = 'TableHeader';

export const TableBody = forwardRef<
  HTMLTableSectionElement,
  HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />
));
TableBody.displayName = 'TableBody';

export const TableFooter = forwardRef<
  HTMLTableSectionElement,
  HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      'border-t border-border bg-muted/50 font-medium [&_tr:hover]:bg-transparent [&>tr]:last:border-b-0',
      className,
    )}
    {...props}
  />
));
TableFooter.displayName = 'TableFooter';

export interface TableRowProps extends HTMLAttributes<HTMLTableRowElement> {
  /// Выбранная строка (чекбокс/массовые действия) — `data-state="selected"`.
  selected?: boolean;
}

export const TableRow = forwardRef<HTMLTableRowElement, TableRowProps>(
  ({ className, selected = false, ...props }, ref) => (
    <tr
      ref={ref}
      data-state={selected ? 'selected' : undefined}
      className={cn(
        'h-row border-b border-border-subtle transition-colors duration-fast',
        'hover:bg-muted/50 data-[state=selected]:bg-primary-soft/40',
        className,
      )}
      {...props}
    />
  ),
);
TableRow.displayName = 'TableRow';

export interface TableHeadProps extends ThHTMLAttributes<HTMLTableCellElement> {
  /// Колонка сортируемая — заголовок становится кнопкой с иконкой направления.
  sortable?: boolean;
  sortDirection?: SortDirection;
  /// Клик по заголовку; цикл направлений решает вызывающий код.
  onSort?: () => void;
  /// Числовая колонка — выравнивание вправо (как у `TableCell numeric`).
  numeric?: boolean;
}

const ARIA_SORT = { asc: 'ascending', desc: 'descending' } as const;

export const TableHead = forwardRef<HTMLTableCellElement, TableHeadProps>(
  (
    {
      className,
      sortable = false,
      sortDirection = null,
      onSort,
      numeric = false,
      children,
      ...props
    },
    ref,
  ) => {
    const SortIcon =
      sortDirection === 'asc' ? ArrowUp : sortDirection === 'desc' ? ArrowDown : ArrowUpDown;
    return (
      <th
        ref={ref}
        scope="col"
        aria-sort={sortable ? (sortDirection ? ARIA_SORT[sortDirection] : 'none') : undefined}
        className={cn(
          'whitespace-nowrap px-3 py-2 text-left align-middle text-xs font-medium text-muted-foreground',
          numeric && 'text-right',
          className,
        )}
        {...props}
      >
        {sortable ? (
          <button
            type="button"
            onClick={onSort}
            className={cn(
              '-mx-1.5 inline-flex h-7 max-w-full items-center gap-1 rounded-sm px-1.5',
              'transition-colors duration-fast hover:bg-muted hover:text-foreground',
              sortDirection && 'text-foreground',
              numeric && 'flex-row-reverse',
            )}
          >
            <span className="truncate">{children}</span>
            <SortIcon
              aria-hidden
              className={cn('size-3.5 shrink-0', !sortDirection && 'text-subtle-foreground')}
            />
          </button>
        ) : (
          children
        )}
      </th>
    );
  },
);
TableHead.displayName = 'TableHead';

export interface TableCellProps extends TdHTMLAttributes<HTMLTableCellElement> {
  /// Числа: выравнивание вправо + табличные цифры.
  numeric?: boolean;
  /// Обрезать длинный текст многоточием. Ширина ограничена
  /// `--cell-max-w` (по умолчанию 20rem) — DataGrid задаёт её из `column.width`.
  truncate?: boolean;
}

export const TableCell = forwardRef<HTMLTableCellElement, TableCellProps>(
  ({ className, numeric = false, truncate = false, children, ...props }, ref) => (
    <td
      ref={ref}
      className={cn('px-3 py-2 align-middle text-sm', numeric && 'text-right tabular', className)}
      {...props}
    >
      {truncate ? (
        <div className="min-w-0 max-w-[var(--cell-max-w,20rem)] truncate">{children}</div>
      ) : (
        children
      )}
    </td>
  ),
);
TableCell.displayName = 'TableCell';

export const TableCaption = forwardRef<
  HTMLTableCaptionElement,
  HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn('caption-top pb-3 text-left text-sm text-muted-foreground', className)}
    {...props}
  />
));
TableCaption.displayName = 'TableCaption';
