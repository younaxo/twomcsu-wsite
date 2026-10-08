'use client';

import { Check, ChevronRight, Minus } from 'lucide-react';
import { ContextMenu as RadixContextMenu } from 'radix-ui';
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type HTMLAttributes,
} from 'react';
import { cn } from '@/lib/cn';
import {
  menuContentClassName,
  menuIndicatorClassName,
  menuItemClassName,
  menuItemDestructiveClassName,
  menuItemInsetClassName,
  menuLabelClassName,
  menuSeparatorClassName,
  menuShortcutClassName,
} from './dropdown-menu';
import { Kbd } from './kbd';

/// ContextMenu — действия по правому клику (на touch — long-press, Radix умеет
/// сам) над строкой таблицы, карточкой, сообщением. Визуал общий с
/// `DropdownMenu`, компонент отдельный: открывается у курсора, без триггера-кнопки.
/// Действия из контекстного меню обязаны дублироваться видимой кнопкой/
/// dropdown — правый клик не обнаруживаем.

export const ContextMenu = RadixContextMenu.Root;
/// Оборачивает область (asChild для строки/карточки); `disabled` отключает меню.
export const ContextMenuTrigger = RadixContextMenu.Trigger;
export const ContextMenuPortal = RadixContextMenu.Portal;
export const ContextMenuGroup = RadixContextMenu.Group;
export const ContextMenuRadioGroup = RadixContextMenu.RadioGroup;
export const ContextMenuSub = RadixContextMenu.Sub;

export const ContextMenuContent = forwardRef<
  ElementRef<typeof RadixContextMenu.Content>,
  ComponentPropsWithoutRef<typeof RadixContextMenu.Content>
>(({ className, collisionPadding = 8, ...props }, ref) => (
  <RadixContextMenu.Portal>
    <RadixContextMenu.Content
      ref={ref}
      collisionPadding={collisionPadding}
      className={cn(
        menuContentClassName,
        'max-h-[var(--radix-context-menu-content-available-height)] origin-[var(--radix-context-menu-content-transform-origin)]',
        className,
      )}
      {...props}
    />
  </RadixContextMenu.Portal>
));
ContextMenuContent.displayName = 'ContextMenuContent';

export interface ContextMenuItemProps extends ComponentPropsWithoutRef<
  typeof RadixContextMenu.Item
> {
  variant?: 'default' | 'destructive';
  inset?: boolean;
}

export const ContextMenuItem = forwardRef<
  ElementRef<typeof RadixContextMenu.Item>,
  ContextMenuItemProps
>(({ className, variant = 'default', inset = false, ...props }, ref) => (
  <RadixContextMenu.Item
    ref={ref}
    className={cn(
      menuItemClassName,
      variant === 'destructive' && menuItemDestructiveClassName,
      inset && menuItemInsetClassName,
      className,
    )}
    {...props}
  />
));
ContextMenuItem.displayName = 'ContextMenuItem';

export const ContextMenuCheckboxItem = forwardRef<
  ElementRef<typeof RadixContextMenu.CheckboxItem>,
  ComponentPropsWithoutRef<typeof RadixContextMenu.CheckboxItem>
>(({ className, checked, children, ...props }, ref) => (
  <RadixContextMenu.CheckboxItem
    ref={ref}
    checked={checked}
    className={cn(menuItemClassName, menuItemInsetClassName, className)}
    {...props}
  >
    <span className={menuIndicatorClassName}>
      <RadixContextMenu.ItemIndicator>
        {checked === 'indeterminate' ? <Minus aria-hidden /> : <Check aria-hidden />}
      </RadixContextMenu.ItemIndicator>
    </span>
    {children}
  </RadixContextMenu.CheckboxItem>
));
ContextMenuCheckboxItem.displayName = 'ContextMenuCheckboxItem';

export const ContextMenuRadioItem = forwardRef<
  ElementRef<typeof RadixContextMenu.RadioItem>,
  ComponentPropsWithoutRef<typeof RadixContextMenu.RadioItem>
>(({ className, children, ...props }, ref) => (
  <RadixContextMenu.RadioItem
    ref={ref}
    className={cn(menuItemClassName, menuItemInsetClassName, className)}
    {...props}
  >
    <span className={menuIndicatorClassName}>
      <RadixContextMenu.ItemIndicator>
        <span aria-hidden className="block size-2 rounded-full bg-current" />
      </RadixContextMenu.ItemIndicator>
    </span>
    {children}
  </RadixContextMenu.RadioItem>
));
ContextMenuRadioItem.displayName = 'ContextMenuRadioItem';

export const ContextMenuLabel = forwardRef<
  ElementRef<typeof RadixContextMenu.Label>,
  ComponentPropsWithoutRef<typeof RadixContextMenu.Label> & { inset?: boolean }
>(({ className, inset = false, ...props }, ref) => (
  <RadixContextMenu.Label
    ref={ref}
    className={cn(menuLabelClassName, inset && menuItemInsetClassName, className)}
    {...props}
  />
));
ContextMenuLabel.displayName = 'ContextMenuLabel';

export const ContextMenuSeparator = forwardRef<
  ElementRef<typeof RadixContextMenu.Separator>,
  ComponentPropsWithoutRef<typeof RadixContextMenu.Separator>
>(({ className, ...props }, ref) => (
  <RadixContextMenu.Separator
    ref={ref}
    className={cn(menuSeparatorClassName, className)}
    {...props}
  />
));
ContextMenuSeparator.displayName = 'ContextMenuSeparator';

export const ContextMenuSubTrigger = forwardRef<
  ElementRef<typeof RadixContextMenu.SubTrigger>,
  ComponentPropsWithoutRef<typeof RadixContextMenu.SubTrigger> & { inset?: boolean }
>(({ className, inset = false, children, ...props }, ref) => (
  <RadixContextMenu.SubTrigger
    ref={ref}
    className={cn(
      menuItemClassName,
      'data-[state=open]:bg-muted',
      inset && menuItemInsetClassName,
      className,
    )}
    {...props}
  >
    {children}
    <ChevronRight aria-hidden className="ml-auto" />
  </RadixContextMenu.SubTrigger>
));
ContextMenuSubTrigger.displayName = 'ContextMenuSubTrigger';

export const ContextMenuSubContent = forwardRef<
  ElementRef<typeof RadixContextMenu.SubContent>,
  ComponentPropsWithoutRef<typeof RadixContextMenu.SubContent>
>(({ className, sideOffset = 4, alignOffset = -4, collisionPadding = 8, ...props }, ref) => (
  <RadixContextMenu.Portal>
    <RadixContextMenu.SubContent
      ref={ref}
      sideOffset={sideOffset}
      alignOffset={alignOffset}
      collisionPadding={collisionPadding}
      className={cn(
        menuContentClassName,
        'max-h-[var(--radix-context-menu-content-available-height)] origin-[var(--radix-context-menu-content-transform-origin)]',
        className,
      )}
      {...props}
    />
  </RadixContextMenu.Portal>
));
ContextMenuSubContent.displayName = 'ContextMenuSubContent';

export interface ContextMenuShortcutProps extends HTMLAttributes<HTMLSpanElement> {
  keys: string[];
}

export function ContextMenuShortcut({ keys, className, ...props }: ContextMenuShortcutProps) {
  return (
    <span
      aria-label={`Сочетание клавиш ${keys.join(' ')}`}
      className={cn(menuShortcutClassName, className)}
      {...props}
    >
      {keys.map((key) => (
        <Kbd key={key}>{key}</Kbd>
      ))}
    </span>
  );
}
