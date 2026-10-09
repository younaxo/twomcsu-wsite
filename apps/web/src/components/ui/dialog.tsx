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
///
/// Единая структура окон «Полдня» (ADR-0064): Header (заголовок, описание,
/// крестик справа) → Body (форма/контент) → Footer (вторичное слева от
/// основного действия, на отдельной тихой подложке). Solid raised surface,
/// крупное скругление, тень, без рамки и blur; тёмный scrim; закрытие по Esc,
/// клику вне окна и крестику.

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

/// Ширины: sm — короткие формы (2–4 поля), md — обычные формы, lg — формы с
/// предпросмотром/списками, xl — таблицы и сложные редакторы.
const sizeClass: Record<NonNullable<DialogContentProps['size']>, string> = {
  sm: 'max-w-[26rem]',
  md: 'max-w-[32rem]',
  lg: 'max-w-[42rem]',
  xl: 'max-w-[56rem]',
};

/// Общая поверхность модальных окон (Dialog/AlertDialog).
export const modalSurfaceClassName =
  'rounded-xl bg-surface-overlay text-foreground shadow-xl edge-highlight';

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
          modalSurfaceClassName,
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
            <IconButton
              aria-label="Закрыть"
              size="sm"
              variant="ghost"
              className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
            >
              <X />
            </IconButton>
          </RadixDialog.Close>
        )}
      </RadixDialog.Content>
    </DialogPortal>
  ),
);
DialogContent.displayName = 'DialogContent';

export const modalHeaderClassName = 'flex shrink-0 flex-col gap-1.5 px-6 pb-4 pt-5 pr-14';
export const modalBodyClassName =
  'min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6 pt-1 scrollbar-thin';
/// Футер — тихая подложка вместо случайной линии: явно отделяет действия.
export const modalFooterClassName =
  'flex shrink-0 flex-col-reverse gap-2 rounded-b-xl bg-background-subtle px-6 py-4 sm:flex-row sm:items-center sm:justify-end';

export function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(modalHeaderClassName, className)} {...props} />;
}

export function DialogBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(modalBodyClassName, className)} {...props} />;
}

export function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(modalFooterClassName, className)} {...props} />;
}

export const DialogTitle = forwardRef<
  ElementRef<typeof RadixDialog.Title>,
  ComponentPropsWithoutRef<typeof RadixDialog.Title>
>(({ className, ...props }, ref) => (
  <RadixDialog.Title
    ref={ref}
    className={cn('font-display text-lg font-semibold leading-snug tracking-tight', className)}
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
    className={cn('text-sm leading-relaxed text-muted-foreground', className)}
    {...props}
  />
));
DialogDescription.displayName = 'DialogDescription';
