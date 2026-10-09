'use client';

import { Info } from 'lucide-react';
import { Popover as RadixPopover } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/// Toggletip — подсказка, которая открывается НАЖАТИЕМ, а не наведением:
/// для touch-устройств и для информации, которую нельзя пропустить.
/// Выглядит как `Tooltip`, но внутри Radix Popover: Escape и клик снаружи
/// закрывают, фокус возвращается на кнопку. Контент — текст/небольшой
/// rich-блок без кнопок; для интерактива используйте `Popover`.

export const toggletipContentClassName = cn(
  'z-tooltip max-w-[min(20rem,calc(100vw-2rem))] rounded-sm bg-foreground px-3 py-2 text-xs leading-snug text-background shadow-lg',
  'overscroll-contain focus:outline-none',
  'data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out',
);

export interface ToggletipProps {
  content: ReactNode;
  /// Доступное имя кнопки-триггера по умолчанию.
  label?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  /// Кастомный триггер — один элемент-кнопка/ссылка. По умолчанию — иконка Info.
  children?: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

export function Toggletip({
  content,
  label = 'Подробнее',
  side = 'top',
  align = 'center',
  children,
  open,
  defaultOpen,
  onOpenChange,
  className,
}: ToggletipProps) {
  return (
    <RadixPopover.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      <RadixPopover.Trigger asChild>
        {children ?? (
          <button
            type="button"
            aria-label={label}
            className={cn(
              'relative inline-flex size-5 items-center justify-center rounded-full text-subtle-foreground',
              'transition-colors duration-fast hover:text-foreground data-[state=open]:text-foreground',
              // Зона нажатия 40px при визуальных 20px — под палец.
              "before:absolute before:-inset-2.5 before:content-['']",
            )}
          >
            <Info aria-hidden className="size-4" />
          </button>
        )}
      </RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          className={cn(toggletipContentClassName, className)}
        >
          {content}
          <RadixPopover.Arrow className="fill-foreground" width={10} height={5} />
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}
