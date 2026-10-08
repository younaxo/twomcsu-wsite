'use client';

import { Command as Cmdk } from 'cmdk';
import { Search } from 'lucide-react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useState,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type HTMLAttributes,
} from 'react';
import { cn } from '@/lib/cn';
import { Dialog, DialogContent, DialogTitle } from './dialog';
import { Kbd } from './kbd';
import { Spinner } from './spinner';

/// Command — палитра команд на cmdk: поиск по страницам, игрокам, действиям.
/// Фильтрация по правам — на стороне вызывающего кода: в список передаются
/// только команды, доступные текущему пользователю; компонент их не скрывает.

export type CommandProps = ComponentPropsWithoutRef<typeof Cmdk>;

export const Command = forwardRef<ElementRef<typeof Cmdk>, CommandProps>(
  ({ className, ...props }, ref) => (
    <Cmdk
      ref={ref}
      className={cn(
        'flex h-full w-full flex-col overflow-hidden rounded-lg text-foreground',
        className,
      )}
      {...props}
    />
  ),
);
Command.displayName = 'Command';

export interface CommandDialogProps extends CommandProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /// Доступное имя окна (не отображается).
  title?: string;
}

/// Палитра в модальном окне без заголовка: верхняя треть экрана, max-w-xl.
export function CommandDialog({
  open,
  onOpenChange,
  title = 'Командная палитра',
  className,
  children,
  ...props
}: CommandDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        aria-describedby={undefined}
        className={cn(
          // Центрирование по X через `translate`: keyframes pop-in перебивают `transform`.
          'top-[15%] max-h-[calc(85dvh-1rem)] max-w-xl translate-x-0 translate-y-0 overflow-hidden p-0 [translate:-50%_0]',
        )}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <Command label={title} className={className} {...props}>
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  );
}

export const CommandInput = forwardRef<
  ElementRef<typeof Cmdk.Input>,
  ComponentPropsWithoutRef<typeof Cmdk.Input>
>(({ className, placeholder = 'Поиск команд…', ...props }, ref) => (
  // Фокус показывается рамкой контейнера, у самого поля outline убран.
  <div
    className="flex shrink-0 items-center gap-2 border-b border-border px-3 transition-[border-color] duration-fast focus-within:border-ring"
    cmdk-input-wrapper=""
  >
    <Search aria-hidden className="size-4 shrink-0 text-subtle-foreground" />
    <Cmdk.Input
      ref={ref}
      placeholder={placeholder}
      className={cn(
        'h-control-lg w-full min-w-0 bg-transparent text-sm text-foreground outline-none',
        'placeholder:text-subtle-foreground disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    />
  </div>
));
CommandInput.displayName = 'CommandInput';

export const CommandList = forwardRef<
  ElementRef<typeof Cmdk.List>,
  ComponentPropsWithoutRef<typeof Cmdk.List>
>(({ className, ...props }, ref) => (
  <Cmdk.List
    ref={ref}
    className={cn(
      'max-h-80 overflow-y-auto overflow-x-hidden overscroll-contain p-1 scrollbar-thin',
      className,
    )}
    {...props}
  />
));
CommandList.displayName = 'CommandList';

export const CommandEmpty = forwardRef<
  ElementRef<typeof Cmdk.Empty>,
  ComponentPropsWithoutRef<typeof Cmdk.Empty>
>(({ className, children = 'Ничего не найдено', ...props }, ref) => (
  <Cmdk.Empty
    ref={ref}
    className={cn('py-6 text-center text-sm text-muted-foreground', className)}
    {...props}
  >
    {children}
  </Cmdk.Empty>
));
CommandEmpty.displayName = 'CommandEmpty';

/// Показывать при асинхронной подгрузке результатов.
export const CommandLoading = forwardRef<
  ElementRef<typeof Cmdk.Loading>,
  ComponentPropsWithoutRef<typeof Cmdk.Loading>
>(({ className, label = 'Загрузка…', children, ...props }, ref) => (
  <Cmdk.Loading ref={ref} label={label} className={cn('py-6', className)} {...props}>
    {children ?? (
      <div className="flex justify-center">
        <Spinner size="sm" label={label} />
      </div>
    )}
  </Cmdk.Loading>
));
CommandLoading.displayName = 'CommandLoading';

export const CommandGroup = forwardRef<
  ElementRef<typeof Cmdk.Group>,
  ComponentPropsWithoutRef<typeof Cmdk.Group>
>(({ className, ...props }, ref) => (
  <Cmdk.Group
    ref={ref}
    className={cn(
      'overflow-hidden p-1 text-foreground',
      '[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-subtle-foreground',
      className,
    )}
    {...props}
  />
));
CommandGroup.displayName = 'CommandGroup';

export const CommandSeparator = forwardRef<
  ElementRef<typeof Cmdk.Separator>,
  ComponentPropsWithoutRef<typeof Cmdk.Separator>
>(({ className, ...props }, ref) => (
  <Cmdk.Separator
    ref={ref}
    className={cn('-mx-1 my-1 h-px bg-border-subtle', className)}
    {...props}
  />
));
CommandSeparator.displayName = 'CommandSeparator';

/// Пункт: иконка слева (16px, приглушённая), текст, `CommandShortcut` справа.
/// Выделение — `data-[selected=true]`, недоступный — `data-[disabled=true]`.
export const CommandItem = forwardRef<
  ElementRef<typeof Cmdk.Item>,
  ComponentPropsWithoutRef<typeof Cmdk.Item>
>(({ className, ...props }, ref) => (
  <Cmdk.Item
    ref={ref}
    className={cn(
      'relative flex h-control-sm cursor-default select-none items-center gap-2 rounded-sm px-2 text-sm outline-none',
      'data-[selected=true]:bg-muted data-[selected=true]:text-foreground',
      'data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50',
      '[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground',
      className,
    )}
    {...props}
  />
));
CommandItem.displayName = 'CommandItem';

export interface CommandShortcutProps extends HTMLAttributes<HTMLSpanElement> {
  /// Клавиши по порядку: ['⌘', 'K'], ['Ctrl', 'B'], ['G', 'P'].
  keys: string[];
}

/// Сочетание клавиш справа в пункте — через `Kbd`.
export function CommandShortcut({ keys, className, ...props }: CommandShortcutProps) {
  return (
    <span
      className={cn('ml-auto flex shrink-0 gap-0.5 pl-3', className)}
      aria-label={`Сочетание клавиш ${keys.join(' ')}`}
      {...props}
    >
      {keys.map((key, index) => (
        <Kbd key={`${key}-${index}`}>{key}</Kbd>
      ))}
    </span>
  );
}

export interface UseCommandPaletteOptions {
  /// Выключить глобальное сочетание (например, внутри текстового редактора).
  enabled?: boolean;
}

/// Состояние палитры + глобальный ⌘K / Ctrl+K (один listener на хук, снимается
/// при размонтировании). Проверяется `event.code`, чтобы сочетание работало
/// и в русской раскладке.
export function useCommandPalette({ enabled = true }: UseCommandPaletteOptions = {}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      const isK = event.code === 'KeyK' || event.key.toLowerCase() === 'k';
      if (isK && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);

  const toggle = useCallback(() => setOpen((value) => !value), []);

  return { open, setOpen, toggle };
}
