'use client';

import { Check, ChevronRight, Minus } from 'lucide-react';
import { DropdownMenu as RadixDropdownMenu } from 'radix-ui';
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type HTMLAttributes,
} from 'react';
import { cn } from '@/lib/cn';
import { useIsMobile } from '@/lib/use-media-query';
import { Kbd } from './kbd';

/// DropdownMenu — СПИСОК ДЕЙСТВИЙ по кнопке («…» в строке таблицы, меню
/// профиля). Для произвольного контента (формы, фильтры) — `Popover`.
/// Правый клик / long-press — `ContextMenu`: тот же визуал, классы ниже общие.
///
/// Mobile: на узком экране список действий показывается в `BottomSheet`
/// (`drawer.tsx`), а не в выпадающем меню. Выбор делает `useMenuPresentation()`,
/// сборка `ResponsiveMenu` — на стороне drawer, здесь только меню.

/* ---------- Общие классы поверхности меню (DropdownMenu, ContextMenu, Command) ---------- */

export const menuContentClassName = cn(
  'z-dropdown min-w-48 max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain rounded-lg bg-surface-overlay p-1 text-foreground shadow-lg scrollbar-thin',
  'data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out',
  '[--pop-y:-4px] data-[side=top]:[--pop-y:4px] data-[side=left]:[--pop-y:0] data-[side=right]:[--pop-y:0]',
);

/// Пункт меню. Подсветка — через фокус (Radix фокусирует пункт и под
/// указателем, и при навигации стрелками), outline заменён фоном.
export const menuItemClassName = cn(
  'relative flex h-control-sm cursor-default select-none items-center gap-2 rounded-sm px-2 text-sm text-foreground outline-none',
  '[@media(pointer:coarse)]:h-10',
  'transition-colors duration-fast focus:bg-muted',
  // Недоступный пункт — курсор not-allowed (правило «Полдня»); Radix сам не
  // выбирает и не подсвечивает disabled-пункты.
  'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
  '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 [&>svg]:text-muted-foreground',
);

export const menuItemDestructiveClassName =
  'text-destructive focus:bg-destructive-soft [&>svg]:text-destructive';
export const menuItemInsetClassName = 'pl-8';
export const menuLabelClassName = 'px-2 py-1.5 text-xs font-medium text-subtle-foreground';
export const menuSeparatorClassName = '-mx-1 my-1 h-px bg-border-subtle';
export const menuShortcutClassName = 'ml-auto flex shrink-0 gap-0.5 pl-4';
export const menuIndicatorClassName =
  'absolute left-2 inline-flex size-4 items-center justify-center text-foreground';

/* ---------- Mobile ---------- */

/// Где показывать список действий: `dropdown` на десктопе, `sheet` на узком
/// экране (BottomSheet из drawer.tsx). Единая точка переключения для ResponsiveMenu.
export function useMenuPresentation(): 'dropdown' | 'sheet' {
  return useIsMobile() ? 'sheet' : 'dropdown';
}

/* ---------- Части ---------- */

export const DropdownMenu = RadixDropdownMenu.Root;
export const DropdownMenuTrigger = RadixDropdownMenu.Trigger;
export const DropdownMenuPortal = RadixDropdownMenu.Portal;
export const DropdownMenuGroup = RadixDropdownMenu.Group;
export const DropdownMenuRadioGroup = RadixDropdownMenu.RadioGroup;
export const DropdownMenuSub = RadixDropdownMenu.Sub;

export const DropdownMenuContent = forwardRef<
  ElementRef<typeof RadixDropdownMenu.Content>,
  ComponentPropsWithoutRef<typeof RadixDropdownMenu.Content>
>(({ className, sideOffset = 6, collisionPadding = 8, ...props }, ref) => (
  <RadixDropdownMenu.Portal>
    <RadixDropdownMenu.Content
      ref={ref}
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      className={cn(
        menuContentClassName,
        'max-h-[var(--radix-dropdown-menu-content-available-height)] origin-[var(--radix-dropdown-menu-content-transform-origin)]',
        className,
      )}
      {...props}
    />
  </RadixDropdownMenu.Portal>
));
DropdownMenuContent.displayName = 'DropdownMenuContent';

export interface DropdownMenuItemProps extends ComponentPropsWithoutRef<
  typeof RadixDropdownMenu.Item
> {
  /// `destructive` — удаление/бан: красный текст, красная подсветка.
  variant?: 'default' | 'destructive';
  /// Отступ слева как у пунктов с индикатором — для ровного смешанного списка.
  inset?: boolean;
}

/// Пункт: иконка слева (`<Trash />`), текст, `DropdownMenuShortcut` справа.
export const DropdownMenuItem = forwardRef<
  ElementRef<typeof RadixDropdownMenu.Item>,
  DropdownMenuItemProps
>(({ className, variant = 'default', inset = false, ...props }, ref) => (
  <RadixDropdownMenu.Item
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
DropdownMenuItem.displayName = 'DropdownMenuItem';

export const DropdownMenuCheckboxItem = forwardRef<
  ElementRef<typeof RadixDropdownMenu.CheckboxItem>,
  ComponentPropsWithoutRef<typeof RadixDropdownMenu.CheckboxItem>
>(({ className, checked, children, ...props }, ref) => (
  <RadixDropdownMenu.CheckboxItem
    ref={ref}
    checked={checked}
    className={cn(menuItemClassName, menuItemInsetClassName, className)}
    {...props}
  >
    <span className={menuIndicatorClassName}>
      <RadixDropdownMenu.ItemIndicator>
        {checked === 'indeterminate' ? <Minus aria-hidden /> : <Check aria-hidden />}
      </RadixDropdownMenu.ItemIndicator>
    </span>
    {children}
  </RadixDropdownMenu.CheckboxItem>
));
DropdownMenuCheckboxItem.displayName = 'DropdownMenuCheckboxItem';

export const DropdownMenuRadioItem = forwardRef<
  ElementRef<typeof RadixDropdownMenu.RadioItem>,
  ComponentPropsWithoutRef<typeof RadixDropdownMenu.RadioItem>
>(({ className, children, ...props }, ref) => (
  <RadixDropdownMenu.RadioItem
    ref={ref}
    className={cn(menuItemClassName, menuItemInsetClassName, className)}
    {...props}
  >
    <span className={menuIndicatorClassName}>
      <RadixDropdownMenu.ItemIndicator>
        <span aria-hidden className="block size-2 rounded-full bg-current" />
      </RadixDropdownMenu.ItemIndicator>
    </span>
    {children}
  </RadixDropdownMenu.RadioItem>
));
DropdownMenuRadioItem.displayName = 'DropdownMenuRadioItem';

export const DropdownMenuLabel = forwardRef<
  ElementRef<typeof RadixDropdownMenu.Label>,
  ComponentPropsWithoutRef<typeof RadixDropdownMenu.Label> & { inset?: boolean }
>(({ className, inset = false, ...props }, ref) => (
  <RadixDropdownMenu.Label
    ref={ref}
    className={cn(menuLabelClassName, inset && menuItemInsetClassName, className)}
    {...props}
  />
));
DropdownMenuLabel.displayName = 'DropdownMenuLabel';

export const DropdownMenuSeparator = forwardRef<
  ElementRef<typeof RadixDropdownMenu.Separator>,
  ComponentPropsWithoutRef<typeof RadixDropdownMenu.Separator>
>(({ className, ...props }, ref) => (
  <RadixDropdownMenu.Separator
    ref={ref}
    className={cn(menuSeparatorClassName, className)}
    {...props}
  />
));
DropdownMenuSeparator.displayName = 'DropdownMenuSeparator';

export const DropdownMenuSubTrigger = forwardRef<
  ElementRef<typeof RadixDropdownMenu.SubTrigger>,
  ComponentPropsWithoutRef<typeof RadixDropdownMenu.SubTrigger> & { inset?: boolean }
>(({ className, inset = false, children, ...props }, ref) => (
  <RadixDropdownMenu.SubTrigger
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
  </RadixDropdownMenu.SubTrigger>
));
DropdownMenuSubTrigger.displayName = 'DropdownMenuSubTrigger';

/// Подменю выравнивается по первому пункту (alignOffset = -p-1 контейнера).
export const DropdownMenuSubContent = forwardRef<
  ElementRef<typeof RadixDropdownMenu.SubContent>,
  ComponentPropsWithoutRef<typeof RadixDropdownMenu.SubContent>
>(({ className, sideOffset = 4, alignOffset = -4, collisionPadding = 8, ...props }, ref) => (
  <RadixDropdownMenu.Portal>
    <RadixDropdownMenu.SubContent
      ref={ref}
      sideOffset={sideOffset}
      alignOffset={alignOffset}
      collisionPadding={collisionPadding}
      className={cn(
        menuContentClassName,
        'max-h-[var(--radix-dropdown-menu-content-available-height)] origin-[var(--radix-dropdown-menu-content-transform-origin)]',
        className,
      )}
      {...props}
    />
  </RadixDropdownMenu.Portal>
));
DropdownMenuSubContent.displayName = 'DropdownMenuSubContent';

export interface DropdownMenuShortcutProps extends HTMLAttributes<HTMLSpanElement> {
  /// Клавиши по порядку: ['⌘', 'K'] или ['Ctrl', 'K'].
  keys: string[];
}

/// Сочетание клавиш справа от текста пункта.
export function DropdownMenuShortcut({ keys, className, ...props }: DropdownMenuShortcutProps) {
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
