'use client';

import type { InventoryItemDto } from '@twomc/shared';
import { Package } from 'lucide-react';
import { useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '@/lib/cn';
import { COLUMNS, slotKey, slotLabel, type SlotMap } from '@/lib/inventory/inventory';

export interface SlotGridProps {
  /// Область инвентаря: hotbar | main | armor | offhand | ender.
  area: string;
  /// Сколько слотов в области (пустые достраиваются).
  size: number;
  items: SlotMap;
  /// Подпись всей сетки для скринридера.
  label: string;
  columns?: number;
  selected: string | null;
  onSelect: (key: string, item: InventoryItemDto | undefined) => void;
}

/// Сетка слотов: `role="grid"`, одна точка входа по Tab (roving tabindex),
/// навигация стрелками, Home/End. Каждая ячейка — кнопка с подписью
/// «область, слот N: предмет, количество». Иконки предметов (ресурс-пак,
/// Q40 а) подключаются позже: пока запасная иконка и короткое имя.
export function SlotGrid({
  area,
  size,
  items,
  label,
  columns = COLUMNS,
  selected,
  onSelect,
}: SlotGridProps) {
  const [active, setActive] = useState(0);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const cols = Math.min(columns, size);
  const rows = Math.ceil(size / cols);

  const move = (index: number) => {
    const next = Math.max(0, Math.min(size - 1, index));
    setActive(next);
    refs.current[next]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const row = Math.floor(index / cols);
    switch (event.key) {
      case 'ArrowRight':
        move(index + 1);
        break;
      case 'ArrowLeft':
        move(index - 1);
        break;
      case 'ArrowDown':
        if (row < rows - 1) move(index + cols);
        break;
      case 'ArrowUp':
        if (row > 0) move(index - cols);
        break;
      case 'Home':
        move(row * cols);
        break;
      case 'End':
        move(Math.min(size - 1, row * cols + cols - 1));
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  return (
    <div role="grid" aria-label={label} aria-rowcount={rows} aria-colcount={cols}>
      {Array.from({ length: rows }, (_, r) => (
        <div
          key={r}
          role="row"
          className="mb-1 grid gap-1"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: Math.min(cols, size - r * cols) }, (_, c) => {
            const index = r * cols + c;
            const key = slotKey(area, index);
            const item = items.get(key);
            const isSelected = selected === key;
            return (
              <div key={key} role="gridcell" aria-selected={isSelected}>
                <button
                  ref={(node) => {
                    refs.current[index] = node;
                  }}
                  type="button"
                  tabIndex={index === active ? 0 : -1}
                  aria-label={slotLabel(area, index, item)}
                  aria-pressed={isSelected}
                  data-testid={`slot-${key}`}
                  data-empty={item ? undefined : 'true'}
                  onFocus={() => setActive(index)}
                  onKeyDown={(event) => onKeyDown(event, index)}
                  onClick={() => onSelect(key, item)}
                  className={cn(
                    'relative flex aspect-square w-full items-center justify-center rounded-md border text-foreground',
                    'transition-colors duration-fast',
                    item
                      ? 'border-border-strong bg-surface-raised hover:border-primary'
                      : 'border-border-subtle bg-surface-sunken text-subtle-foreground',
                    isSelected && 'border-primary ring-2 ring-primary',
                  )}
                >
                  {item ? (
                    <>
                      <Package aria-hidden className="size-1/2 text-muted-foreground" />
                      {item.count > 1 ? (
                        <span
                          aria-hidden
                          className="absolute bottom-0.5 right-1 font-mono text-xs font-semibold tabular-nums"
                        >
                          {item.count}
                        </span>
                      ) : null}
                    </>
                  ) : null}
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
