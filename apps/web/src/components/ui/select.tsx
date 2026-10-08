'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { Select as RadixSelect } from 'radix-ui';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import { cn } from '@/lib/cn';

/// Select — выбор одного значения из короткого списка (Radix Select).
/// Для списков с поиском — `Combobox`, для множественного выбора — `MultiSelect`.
/// Триггер выглядит как `Input`: те же высоты, рамка, фокус и invalid-состояние.

export const Select = RadixSelect.Root;
export const SelectGroup = RadixSelect.Group;
export const SelectValue = RadixSelect.Value;

/// Классы Input-подобного триггера. Переиспользуются Combobox/MultiSelect/
/// DatePicker/ColorPicker, чтобы все «поля-кнопки» выглядели одинаково.
export const selectTriggerVariants = cva(
  [
    'flex w-full min-w-0 items-center justify-between gap-2 rounded border border-border bg-surface px-control-px text-left text-foreground',
    'transition-[border-color,box-shadow] duration-fast',
    'hover:border-border-strong',
    'focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
    'aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive/30',
    'data-[invalid]:border-destructive data-[invalid]:focus-visible:ring-destructive/30',
    'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:opacity-60',
    'data-[placeholder]:text-subtle-foreground',
    '[&_svg]:size-4 [&_svg]:shrink-0',
  ],
  {
    variants: {
      size: {
        sm: 'h-control-sm text-sm',
        md: 'h-control text-sm',
        lg: 'h-control-lg text-base',
      },
    },
    defaultVariants: { size: 'md' },
  },
);

export interface SelectTriggerProps
  extends
    ComponentPropsWithoutRef<typeof RadixSelect.Trigger>,
    VariantProps<typeof selectTriggerVariants> {
  invalid?: boolean;
}

export const SelectTrigger = forwardRef<ElementRef<typeof RadixSelect.Trigger>, SelectTriggerProps>(
  ({ className, size, invalid, children, ...props }, ref) => (
    <RadixSelect.Trigger
      ref={ref}
      aria-invalid={invalid || props['aria-invalid'] || undefined}
      className={cn(
        selectTriggerVariants({ size }),
        '[&>span:first-child]:min-w-0 [&>span:first-child]:truncate',
        className,
      )}
      {...props}
    >
      {children}
      <RadixSelect.Icon asChild>
        <ChevronDown aria-hidden className="text-subtle-foreground" />
      </RadixSelect.Icon>
    </RadixSelect.Trigger>
  ),
);
SelectTrigger.displayName = 'SelectTrigger';

export const SelectScrollUpButton = forwardRef<
  ElementRef<typeof RadixSelect.ScrollUpButton>,
  ComponentPropsWithoutRef<typeof RadixSelect.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <RadixSelect.ScrollUpButton
    ref={ref}
    className={cn(
      'flex cursor-default items-center justify-center py-1 text-subtle-foreground',
      className,
    )}
    {...props}
  >
    <ChevronUp aria-hidden className="size-4" />
  </RadixSelect.ScrollUpButton>
));
SelectScrollUpButton.displayName = 'SelectScrollUpButton';

export const SelectScrollDownButton = forwardRef<
  ElementRef<typeof RadixSelect.ScrollDownButton>,
  ComponentPropsWithoutRef<typeof RadixSelect.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <RadixSelect.ScrollDownButton
    ref={ref}
    className={cn(
      'flex cursor-default items-center justify-center py-1 text-subtle-foreground',
      className,
    )}
    {...props}
  >
    <ChevronDown aria-hidden className="size-4" />
  </RadixSelect.ScrollDownButton>
));
SelectScrollDownButton.displayName = 'SelectScrollDownButton';

export const SelectContent = forwardRef<
  ElementRef<typeof RadixSelect.Content>,
  ComponentPropsWithoutRef<typeof RadixSelect.Content>
>(
  (
    { className, position = 'popper', sideOffset = 4, collisionPadding = 8, children, ...props },
    ref,
  ) => (
    <RadixSelect.Portal>
      <RadixSelect.Content
        ref={ref}
        position={position}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          'relative z-50 min-w-32 max-w-[calc(100vw-2rem)] overflow-hidden',
          'max-h-[min(18rem,var(--radix-select-content-available-height))]',
          'rounded-lg glass-frosted text-foreground',
          'data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out',
          'data-[side=bottom]:[--pop-y:-4px] data-[side=top]:[--pop-y:4px]',
          position === 'popper' && 'w-[var(--radix-select-trigger-width)]',
          className,
        )}
        {...props}
      >
        <SelectScrollUpButton />
        <RadixSelect.Viewport className="p-1 overscroll-contain scrollbar-thin">
          {children}
        </RadixSelect.Viewport>
        <SelectScrollDownButton />
      </RadixSelect.Content>
    </RadixSelect.Portal>
  ),
);
SelectContent.displayName = 'SelectContent';

export const SelectLabel = forwardRef<
  ElementRef<typeof RadixSelect.Label>,
  ComponentPropsWithoutRef<typeof RadixSelect.Label>
>(({ className, ...props }, ref) => (
  <RadixSelect.Label
    ref={ref}
    className={cn('px-2 py-1.5 text-xs font-medium text-muted-foreground', className)}
    {...props}
  />
));
SelectLabel.displayName = 'SelectLabel';

export const SelectItem = forwardRef<
  ElementRef<typeof RadixSelect.Item>,
  ComponentPropsWithoutRef<typeof RadixSelect.Item>
>(({ className, children, ...props }, ref) => (
  <RadixSelect.Item
    ref={ref}
    className={cn(
      'relative flex h-control-sm w-full cursor-default select-none items-center rounded-sm pl-8 pr-2 text-sm text-foreground outline-none',
      'focus:bg-muted data-[state=checked]:font-medium',
      'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      '[&_svg]:size-4 [&_svg]:shrink-0',
      className,
    )}
    {...props}
  >
    <span className="absolute left-2 inline-flex size-4 items-center justify-center">
      <RadixSelect.ItemIndicator>
        <Check aria-hidden className="size-4" />
      </RadixSelect.ItemIndicator>
    </span>
    <RadixSelect.ItemText>{children}</RadixSelect.ItemText>
  </RadixSelect.Item>
));
SelectItem.displayName = 'SelectItem';

export const SelectSeparator = forwardRef<
  ElementRef<typeof RadixSelect.Separator>,
  ComponentPropsWithoutRef<typeof RadixSelect.Separator>
>(({ className, ...props }, ref) => (
  <RadixSelect.Separator
    ref={ref}
    className={cn('-mx-1 my-1 h-px bg-border-subtle', className)}
    {...props}
  />
));
SelectSeparator.displayName = 'SelectSeparator';
