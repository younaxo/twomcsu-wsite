'use client';

import { X } from 'lucide-react';
import { Dialog as RadixDialog } from 'radix-ui';
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type HTMLAttributes,
} from 'react';
import { cn } from '@/lib/cn';
import { IconButton } from './button';
import { DialogDescription, DialogOverlay, DialogPortal, DialogTitle } from './dialog';

/// Sheet — боковая модальная панель на Radix Dialog: фильтры, карточка объекта,
/// длинная форма рядом с таблицей. На экранах < 640px всегда во всю ширину.
/// Для мобильного bottom-sheet с жестами используйте `Drawer`/`BottomSheet`.

export const Sheet = RadixDialog.Root;
export const SheetTrigger = RadixDialog.Trigger;
export const SheetClose = RadixDialog.Close;
export const SheetPortal = DialogPortal;
export const SheetOverlay = DialogOverlay;
export const SheetTitle = DialogTitle;
export const SheetDescription = DialogDescription;

export type SheetSide = 'right' | 'left' | 'top' | 'bottom';
export type SheetSize = 'sm' | 'md' | 'lg' | 'full';

export interface SheetContentProps extends ComponentPropsWithoutRef<typeof RadixDialog.Content> {
  side?: SheetSide;
  /// Ширина для right/left (на desktop), высота для top/bottom.
  size?: SheetSize;
  /// Скрыть кнопку закрытия в углу (если у панели свои действия).
  hideClose?: boolean;
}

const sideClass: Record<SheetSide, string> = {
  right: cn(
    'inset-y-0 right-0 h-dvh border-l sm:rounded-l-lg',
    'data-[state=open]:animate-slide-in-right data-[state=closed]:animate-slide-out-right',
  ),
  left: cn(
    'inset-y-0 left-0 h-dvh border-r sm:rounded-r-lg',
    'data-[state=open]:animate-slide-in-left data-[state=closed]:animate-slide-out-left',
  ),
  top: cn(
    'inset-x-0 top-0 rounded-b-lg border-b',
    'data-[state=open]:animate-slide-in-top data-[state=closed]:animate-slide-out-top',
  ),
  bottom: cn(
    'inset-x-0 bottom-0 rounded-t-lg border-t',
    'data-[state=open]:animate-slide-in-bottom data-[state=closed]:animate-slide-out-bottom',
  ),
};

/// Ширина боковых панелей: на мобильном всегда во весь экран.
const widthClass: Record<SheetSize, string> = {
  sm: 'w-screen sm:w-80',
  md: 'w-screen sm:w-[28rem]',
  lg: 'w-screen sm:w-[36rem]',
  full: 'w-screen',
};

const heightClass: Record<SheetSize, string> = {
  sm: 'max-h-[40dvh]',
  md: 'max-h-[60dvh]',
  lg: 'max-h-[85dvh]',
  full: 'h-dvh',
};

export const SheetContent = forwardRef<ElementRef<typeof RadixDialog.Content>, SheetContentProps>(
  ({ className, side = 'right', size = 'md', hideClose = false, children, ...props }, ref) => {
    const horizontal = side === 'right' || side === 'left';
    return (
      <SheetPortal>
        <SheetOverlay />
        <RadixDialog.Content
          ref={ref}
          className={cn(
            'fixed z-50 flex flex-col glass-frosted-strong text-foreground',
            'overscroll-contain focus:outline-none',
            // Нижний safe-area (iOS home indicator) — часть панели, а не футера.
            'pb-[env(safe-area-inset-bottom)]',
            sideClass[side],
            horizontal ? widthClass[size] : heightClass[size],
            className,
          )}
          {...props}
        >
          {children}
          {hideClose ? null : (
            <RadixDialog.Close asChild>
              <IconButton aria-label="Закрыть" size="sm" className="absolute right-3 top-3">
                <X />
              </IconButton>
            </RadixDialog.Close>
          )}
        </RadixDialog.Content>
      </SheetPortal>
    );
  },
);
SheetContent.displayName = 'SheetContent';

export function SheetHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex shrink-0 flex-col gap-1 p-card-p pb-4 pr-12', className)} {...props} />
  );
}

/// Прокручиваемая часть панели; заголовок и футер остаются на месте.
export function SheetBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'min-h-0 flex-1 overflow-y-auto overscroll-contain px-card-p pb-card-p scrollbar-thin',
        className,
      )}
      {...props}
    />
  );
}

export function SheetFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex shrink-0 flex-col-reverse gap-2 border-t border-border-subtle p-card-p pt-4 sm:flex-row sm:justify-end',
        className,
      )}
      {...props}
    />
  );
}
