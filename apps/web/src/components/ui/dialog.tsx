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

/// Dialog — обычное интерактивное модальное окно (формы, детали, quick view).
/// Для подтверждения опасных действий — `AlertDialog` (отдельный компонент).

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;
export const DialogPortal = RadixDialog.Portal;

export const DialogOverlay = forwardRef<
  ElementRef<typeof RadixDialog.Overlay>,
  ComponentPropsWithoutRef<typeof RadixDialog.Overlay>
>(({ className, ...props }, ref) => (
  <RadixDialog.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-scrim',
      'data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out',
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = 'DialogOverlay';

export interface DialogContentProps extends ComponentPropsWithoutRef<typeof RadixDialog.Content> {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /// Скрыть кнопку закрытия в углу (если у окна свои действия).
  hideClose?: boolean;
}

const sizeClass: Record<NonNullable<DialogContentProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export const DialogContent = forwardRef<ElementRef<typeof RadixDialog.Content>, DialogContentProps>(
  ({ className, size = 'md', hideClose = false, children, ...props }, ref) => (
    <DialogPortal>
      <DialogOverlay />
      <RadixDialog.Content
        ref={ref}
        className={cn(
          // Центрирование через CSS-свойство `translate` (не `transform`): keyframes
          // pop-in/pop-out задают свой transform и не должны сбивать позицию.
          'fixed left-1/2 top-1/2 z-50 flex w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)] flex-col [translate:-50%_-50%]',
          'rounded-lg border bg-surface-overlay text-foreground shadow-lg edge-highlight',
          'overscroll-contain focus:outline-none',
          'data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out [--pop-y:8px]',
          sizeClass[size],
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
    </DialogPortal>
  ),
);
DialogContent.displayName = 'DialogContent';

export function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1 p-card-p pb-0 pr-12', className)} {...props} />;
}

export function DialogBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('min-h-0 flex-1 overflow-y-auto p-card-p scrollbar-thin', className)}
      {...props}
    />
  );
}

export function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-col-reverse gap-2 border-t border-border-subtle p-card-p pt-4 sm:flex-row sm:justify-end',
        className,
      )}
      {...props}
    />
  );
}

export const DialogTitle = forwardRef<
  ElementRef<typeof RadixDialog.Title>,
  ComponentPropsWithoutRef<typeof RadixDialog.Title>
>(({ className, ...props }, ref) => (
  <RadixDialog.Title
    ref={ref}
    className={cn('font-display text-lg font-semibold leading-tight', className)}
    {...props}
  />
));
DialogTitle.displayName = 'DialogTitle';

export const DialogDescription = forwardRef<
  ElementRef<typeof RadixDialog.Description>,
  ComponentPropsWithoutRef<typeof RadixDialog.Description>
>(({ className, ...props }, ref) => (
  <RadixDialog.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
DialogDescription.displayName = 'DialogDescription';
