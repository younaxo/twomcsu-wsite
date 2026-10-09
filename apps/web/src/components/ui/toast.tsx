'use client';

import { CircleAlert, CircleCheck, Info, Loader2, TriangleAlert, X } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  Toaster as SonnerToaster,
  toast as sonnerToast,
  type ExternalToast,
  type ToasterProps as SonnerToasterProps,
} from 'sonner';
import { cn } from '@/lib/cn';
import { useIsMobile } from '@/lib/use-media-query';

/// Toast — короткие сообщения о результате действия (sonner).
/// `Toaster` монтируется один раз в корне приложения; `aria-live` даёт sonner.
/// Тексты — sentence case: «Роль сохранена», «Не удалось забанить игрока».

export type ToastId = string | number;

export interface ToastActionOptions {
  label: ReactNode;
  onClick: () => void;
}

export interface ToastOptions {
  /// Вторая строка: что именно произошло / что делать дальше.
  description?: ReactNode;
  /// Основное действие («Отменить», «Открыть») — кнопка справа.
  action?: ToastActionOptions;
  /// Вторичное действие (закрывает toast после клика).
  cancel?: ToastActionOptions;
  /// Мс до автозакрытия; по умолчанию 5000 (Toaster).
  duration?: number;
  /// Не закрывать автоматически (= `Infinity`) — для loading и ошибок, требующих внимания.
  persistent?: boolean;
  /// Переиспользовать id: `toast.loading('Сохраняем…', { id })` → `toast.success('Сохранено', { id })`.
  id?: ToastId;
  onDismiss?: () => void;
}

function toSonner(options: ToastOptions = {}): ExternalToast {
  const { description, action, cancel, duration, persistent, id, onDismiss } = options;
  return {
    id,
    description,
    action: action ? { label: action.label, onClick: action.onClick } : undefined,
    cancel: cancel ? { label: cancel.label, onClick: cancel.onClick } : undefined,
    duration: persistent ? Infinity : duration,
    onDismiss: onDismiss ? () => onDismiss() : undefined,
  };
}

export interface ToastPromiseOptions<T> extends Omit<ToastOptions, 'description' | 'persistent'> {
  loading: ReactNode;
  success: ReactNode | ((data: T) => ReactNode);
  error: ReactNode | ((error: unknown) => ReactNode);
  description?: ReactNode | ((data: T) => ReactNode);
  finally?: () => void;
}

/// API уведомлений. Каждый метод возвращает id — им можно обновить
/// или закрыть toast (`toast.dismiss(id)`).
export const toast = {
  success: (title: ReactNode, options?: ToastOptions): ToastId =>
    sonnerToast.success(title, toSonner(options)),
  error: (title: ReactNode, options?: ToastOptions): ToastId =>
    sonnerToast.error(title, toSonner(options)),
  warning: (title: ReactNode, options?: ToastOptions): ToastId =>
    sonnerToast.warning(title, toSonner(options)),
  info: (title: ReactNode, options?: ToastOptions): ToastId =>
    sonnerToast.info(title, toSonner(options)),
  /// Без иконки — нейтральное сообщение.
  message: (title: ReactNode, options?: ToastOptions): ToastId =>
    sonnerToast.message(title, toSonner(options)),
  /// Спиннер, не закрывается сам: обновите его через тот же id.
  loading: (title: ReactNode, options?: ToastOptions): ToastId =>
    sonnerToast.loading(title, toSonner({ persistent: true, ...options })),
  /// loading → success/error по результату промиса одним toast'ом.
  promise: <T,>(promise: Promise<T> | (() => Promise<T>), options: ToastPromiseOptions<T>) => {
    const { loading, success, error, description, finally: onFinally, ...rest } = options;
    return sonnerToast.promise<T>(promise, {
      ...toSonner(rest),
      loading,
      success,
      error,
      description,
      finally: onFinally,
    });
  },
  /// Без id — закрыть все.
  dismiss: (id?: ToastId): ToastId => sonnerToast.dismiss(id),
};

export interface SnackbarOptions extends Omit<ToastOptions, 'action'> {
  action: ToastActionOptions;
}

/// Snackbar — toast с обязательным действием («Удалено» + «Отменить»).
/// Живёт дольше обычного, чтобы успеть нажать.
export function snackbar(title: ReactNode, options: SnackbarOptions): ToastId {
  return toast.message(title, { duration: 8000, ...options });
}

export type ToasterProps = Omit<SonnerToasterProps, 'richColors' | 'icons' | 'theme'>;

const buttonClassName = cn(
  'inline-flex h-control-sm shrink-0 items-center whitespace-nowrap rounded px-3 text-sm font-medium',
  'transition-[background-color,color,border-color] duration-fast',
);

/// Вся раскраска — токенами через `unstyled`: sonner оставляет только
/// позиционирование, стек и свайп. Порядок узлов у sonner: крестик, иконка,
/// контент, cancel, action — крестик позиционируется абсолютно.
const toastClassNames: NonNullable<SonnerToasterProps['toastOptions']>['classNames'] = {
  toast: cn(
    'relative flex w-[var(--width)] items-start gap-3 p-4 pr-10 font-sans text-sm',
    'rounded-lg border bg-surface-overlay text-foreground shadow-lg edge-highlight',
    // В свёрнутой стопке задние тосты показывают только «корешок» без контента —
    // в режиме unstyled это правило sonner не применяется, повторяем его.
    '[&[data-expanded=false][data-front=false]>*]:opacity-0',
  ),
  icon: 'relative mt-0.5 flex size-4 shrink-0 items-center justify-center [&_svg]:size-4',
  content: 'flex min-w-0 flex-1 flex-col gap-0.5',
  title: 'font-medium leading-snug',
  description: 'leading-snug text-muted-foreground',
  actionButton: cn(
    buttonClassName,
    'ml-auto border border-border bg-surface text-foreground shadow-sm hover:bg-muted active:bg-surface-sunken',
  ),
  cancelButton: cn(
    buttonClassName,
    'ml-auto text-muted-foreground hover:bg-muted hover:text-foreground [&+[data-button]]:ml-0',
  ),
  closeButton: cn(
    'absolute right-2 top-2 inline-flex size-6 items-center justify-center rounded-sm text-subtle-foreground',
    'transition-[background-color,color] duration-fast hover:bg-muted hover:text-foreground [&_svg]:size-3.5',
  ),
};

const icons: NonNullable<SonnerToasterProps['icons']> = {
  success: <CircleCheck aria-hidden className="text-success" />,
  error: <CircleAlert aria-hidden className="text-destructive" />,
  warning: <TriangleAlert aria-hidden className="text-warning" />,
  info: <Info aria-hidden className="text-info" />,
  loading: <Loader2 aria-hidden className="animate-spin text-muted-foreground" />,
  close: <X aria-hidden />,
};

/// Контейнер уведомлений: справа снизу, на mobile — по центру снизу.
/// Монтировать один раз в корневом layout (рядом с `TooltipProvider`).
export function Toaster({ toastOptions, position, ...props }: ToasterProps) {
  const mobile = useIsMobile();
  return (
    <SonnerToaster
      position={position ?? (mobile ? 'bottom-center' : 'bottom-right')}
      richColors={false}
      closeButton
      duration={5000}
      visibleToasts={4}
      gap={12}
      offset={16}
      mobileOffset={16}
      icons={icons}
      containerAriaLabel="Уведомления"
      toastOptions={{
        unstyled: true,
        closeButtonAriaLabel: 'Закрыть',
        ...toastOptions,
        classNames: { ...toastClassNames, ...toastOptions?.classNames },
      }}
      {...props}
    />
  );
}
