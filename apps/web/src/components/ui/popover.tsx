'use client';

import { Popover as RadixPopover } from 'radix-ui';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import { cn } from '@/lib/cn';

/// Popover — ПРОИЗВОЛЬНЫЙ интерактивный контент по клику: фильтры, мини-формы,
/// выбор периода. Для списка действий — `DropdownMenu`, для подсказки по
/// нажатию — `Toggletip`, для превью по наведению — `HoverCard`.
///
/// Radix: при открытии фокус уходит внутрь (первый фокусируемый элемент или
/// сам контейнер), Escape/клик снаружи закрывают, фокус возвращается на триггер.

export const Popover = RadixPopover.Root;
export const PopoverTrigger = RadixPopover.Trigger;
/// Якорь позиционирования, если контент должен открываться не у триггера.
export const PopoverAnchor = RadixPopover.Anchor;
export const PopoverClose = RadixPopover.Close;
export const PopoverPortal = RadixPopover.Portal;

export const popoverContentClassName = cn(
  'z-50 w-72 max-w-[calc(100vw-2rem)] rounded-lg glass-frosted p-4 text-foreground',
  'max-h-[var(--radix-popover-content-available-height)] overflow-y-auto overscroll-contain scrollbar-thin',
  'focus:outline-none',
  'origin-[var(--radix-popover-content-transform-origin)]',
  'data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out',
  '[--pop-y:-4px] data-[side=top]:[--pop-y:4px] data-[side=left]:[--pop-y:0] data-[side=right]:[--pop-y:0]',
);

export interface PopoverContentProps extends ComponentPropsWithoutRef<typeof RadixPopover.Content> {
  /// Стрелка к триггеру (по умолчанию выключена). Со стрелкой контент не
  /// скроллится — иначе стрелка обрезается overflow.
  arrow?: boolean;
}

export const PopoverContent = forwardRef<
  ElementRef<typeof RadixPopover.Content>,
  PopoverContentProps
>(({ className, sideOffset = 6, collisionPadding = 8, arrow = false, children, ...props }, ref) => (
  <RadixPopover.Portal>
    <RadixPopover.Content
      ref={ref}
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      className={cn(popoverContentClassName, arrow && 'max-h-none overflow-visible', className)}
      {...props}
    >
      {children}
      {arrow ? (
        <RadixPopover.Arrow
          className="[fill:rgb(var(--glass-surface)/0.92)]"
          width={12}
          height={6}
        />
      ) : null}
    </RadixPopover.Content>
  </RadixPopover.Portal>
));
PopoverContent.displayName = 'PopoverContent';
