'use client';

import { X } from 'lucide-react';
import { AlertDialog as RadixAlertDialog } from 'radix-ui';
import {
  forwardRef,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type HTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/cn';
import { Button, IconButton, type ButtonProps } from './button';
import {
  modalBodyClassName,
  modalFooterClassName,
  modalHeaderClassName,
  modalSurfaceClassName,
} from './dialog';

/// AlertDialog — модальное подтверждение, которое прерывает работу: удалить роль,
/// забанить игрока, отозвать сессии. Поведение закрытия единое со всеми окнами
/// (ADR-0064): тёмный scrim, крестик справа вверху, Esc и клик вне окна
/// закрывают. Любое закрытие = «Отмена» (безопасно: действие выполняется
/// только кнопкой подтверждения). Пока идёт запрос, ConfirmDialog закрытие
/// игнорирует. Radix ставит `role="alertdialog"` и переводит фокус на
/// `AlertDialogCancel` в футере (наименее опасная кнопка).
///
/// Для типового сценария «подтвердить/отменить» есть готовый `ConfirmDialog`.

export const AlertDialog = RadixAlertDialog.Root;
export const AlertDialogTrigger = RadixAlertDialog.Trigger;
export const AlertDialogPortal = RadixAlertDialog.Portal;

export const AlertDialogOverlay = forwardRef<
  ElementRef<typeof RadixAlertDialog.Overlay>,
  ComponentPropsWithoutRef<typeof RadixAlertDialog.Overlay>
>(({ className, ...props }, ref) => (
  <RadixAlertDialog.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-scrim',
      'data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out',
      className,
    )}
    {...props}
  />
));
AlertDialogOverlay.displayName = 'AlertDialogOverlay';

export interface AlertDialogContentProps extends ComponentPropsWithoutRef<
  typeof RadixAlertDialog.Content
> {
  /// Скрыть крестик (только если у окна есть другой явный способ отмены).
  hideClose?: boolean;
}

export const AlertDialogContent = forwardRef<
  ElementRef<typeof RadixAlertDialog.Content>,
  AlertDialogContentProps
>(({ className, children, hideClose = false, ...props }, ref) => {
  // Клик по подложке = нажатие «Закрыть» (Cancel): Radix AlertDialog сам
  // по клику вне не закрывается, а Cancel проходит через onOpenChange
  // (ConfirmDialog может отклонить закрытие во время запроса).
  const closeRef = useRef<HTMLButtonElement>(null);
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay onClick={() => closeRef.current?.click()} />
      <RadixAlertDialog.Content
        ref={ref}
        className={cn(
          // Центрирование через `translate` (не `transform`): keyframes pop-in/pop-out
          // переопределяют `transform`, и окно не «прыгает» в конце анимации.
          'fixed left-1/2 top-1/2 z-50 flex w-[calc(100vw-2rem)] max-w-[28rem] max-h-[calc(100dvh-2rem)] flex-col [translate:-50%_-50%]',
          modalSurfaceClassName,
          'overscroll-contain focus:outline-none',
          'data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out [--pop-y:8px]',
          className,
        )}
        {...props}
      >
        {/* Крестик раньше children в DOM: начальный фокус Radix остаётся на
            «Отмене» в футере (последний смонтированный Cancel). */}
        <RadixAlertDialog.Cancel asChild>
          <IconButton
            ref={closeRef}
            aria-label="Закрыть"
            size="sm"
            variant="ghost"
            className={cn(
              'absolute right-4 top-4 z-[1] text-muted-foreground hover:text-foreground',
              hideClose && 'hidden',
            )}
          >
            <X />
          </IconButton>
        </RadixAlertDialog.Cancel>
        {children}
      </RadixAlertDialog.Content>
    </AlertDialogPortal>
  );
});
AlertDialogContent.displayName = 'AlertDialogContent';

export function AlertDialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(modalHeaderClassName, className)} {...props} />;
}

export function AlertDialogBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(modalBodyClassName, 'text-sm', className)} {...props} />;
}

export function AlertDialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(modalFooterClassName, className)} {...props} />;
}

export const AlertDialogTitle = forwardRef<
  ElementRef<typeof RadixAlertDialog.Title>,
  ComponentPropsWithoutRef<typeof RadixAlertDialog.Title>
>(({ className, ...props }, ref) => (
  <RadixAlertDialog.Title
    ref={ref}
    className={cn('font-display text-lg font-semibold leading-tight', className)}
    {...props}
  />
));
AlertDialogTitle.displayName = 'AlertDialogTitle';

export const AlertDialogDescription = forwardRef<
  ElementRef<typeof RadixAlertDialog.Description>,
  ComponentPropsWithoutRef<typeof RadixAlertDialog.Description>
>(({ className, ...props }, ref) => (
  <RadixAlertDialog.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
AlertDialogDescription.displayName = 'AlertDialogDescription';

export type AlertDialogCancelProps = Omit<ButtonProps, 'asChild'>;

/// Кнопка отмены: вторичная, получает фокус при открытии.
export const AlertDialogCancel = forwardRef<
  ElementRef<typeof RadixAlertDialog.Cancel>,
  AlertDialogCancelProps
>(({ variant = 'secondary', ...props }, ref) => (
  <RadixAlertDialog.Cancel ref={ref} asChild>
    <Button variant={variant} {...props} />
  </RadixAlertDialog.Cancel>
));
AlertDialogCancel.displayName = 'AlertDialogCancel';

export interface AlertDialogActionProps extends Omit<ButtonProps, 'asChild'> {
  /// Опасное действие — красная кнопка, визуально отличается от отмены.
  destructive?: boolean;
}

/// Подтверждающее действие. По умолчанию закрывает окно после клика; чтобы
/// дождаться запроса, вызовите `event.preventDefault()` в `onClick`.
export const AlertDialogAction = forwardRef<
  ElementRef<typeof RadixAlertDialog.Action>,
  AlertDialogActionProps
>(({ destructive = false, variant, ...props }, ref) => (
  <RadixAlertDialog.Action ref={ref} asChild>
    <Button variant={destructive ? 'destructive' : (variant ?? 'primary')} {...props} />
  </RadixAlertDialog.Action>
));
AlertDialogAction.displayName = 'AlertDialogAction';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /// Что именно произойдёт и можно ли это отменить («Игрок потеряет доступ…»).
  description?: ReactNode;
  /// Глагол действия: «Удалить роль», «Забанить», «Отозвать сессии».
  confirmLabel?: ReactNode;
  cancelLabel?: ReactNode;
  /// Опасное действие — кнопка подтверждения красная.
  destructive?: boolean;
  /// Внешнее состояние запроса. Если не передано, берётся из промиса `onConfirm`.
  loading?: boolean;
  /// Вызывается по подтверждению. Если вернул промис — окно ждёт его: при
  /// успехе закрывается само, при ошибке остаётся открытым (ошибку показывает
  /// вызывающий код, например через `toast.error`).
  onConfirm: () => void | Promise<void>;
  /// Дополнительный контент между описанием и кнопками (список затронутых
  /// объектов, чекбокс «Понимаю последствия»).
  children?: ReactNode;
}

/// Готовое подтверждение для опасных действий. Пока идёт запрос, обе кнопки
/// заблокированы, Escape и клик по подложке не закрывают окно.
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Подтвердить',
  cancelLabel = 'Отмена',
  destructive = false,
  loading,
  onConfirm,
  children,
}: ConfirmDialogProps) {
  const [pending, setPending] = useState(false);
  const busy = loading ?? pending;

  const handleOpenChange = (next: boolean) => {
    if (!next && busy) {
      return;
    }
    onOpenChange(next);
  };

  const handleConfirm = async (event: MouseEvent<HTMLButtonElement>) => {
    // Не даём Radix закрыть окно до завершения запроса.
    event.preventDefault();
    const result = onConfirm();
    if (!(result instanceof Promise)) {
      return;
    }
    setPending(true);
    try {
      await result;
      onOpenChange(false);
    } catch {
      // Ошибку показывает вызывающий код; окно остаётся открытым.
    } finally {
      setPending(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent
        onEscapeKeyDown={(event) => {
          if (busy) {
            event.preventDefault();
          }
        }}
        // Без описания Radix ждёт явного aria-describedby={undefined}.
        {...(description ? {} : { 'aria-describedby': undefined })}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        {children ? <AlertDialogBody>{children}</AlertDialogBody> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction destructive={destructive} loading={busy} onClick={handleConfirm}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
