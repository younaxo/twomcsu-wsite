'use client';

import { CircleAlert, PowerOff, ShieldAlert, WifiOff, Wrench } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import { ApiError, getErrorMessage, NetworkError } from '@/lib/api/errors';
import { cn } from '@/lib/cn';
import { Button } from './button';

export interface ErrorStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /// Ошибка (ApiError/NetworkError/Error) — текст и иконка подбираются по типу.
  error?: unknown;
  title?: ReactNode;
  description?: ReactNode;
  /// Повторить запрос.
  onRetry?: () => void;
  retrying?: boolean;
  size?: 'sm' | 'md';
}

/// Ошибка говорит, что случилось и что делать дальше; не извиняется.
export function ErrorState({
  error,
  title,
  description,
  onRetry,
  retrying = false,
  size = 'md',
  className,
  ...props
}: ErrorStateProps) {
  const isNetwork = error instanceof NetworkError;
  // 503 с кодом недоступности (ADR-0082) и прочие 5xx — понятные тексты.
  const unavailable =
    error instanceof ApiError && error.status === 503 ? (error.code ?? null) : null;
  const isServer = error instanceof ApiError && error.status >= 500 && !unavailable;
  const Icon = isNetwork
    ? WifiOff
    : unavailable === 'MAINTENANCE'
      ? Wrench
      : unavailable === 'MODULE_DISABLED'
        ? PowerOff
        : CircleAlert;
  const fallbackTitle = isNetwork
    ? 'Нет соединения с сервером'
    : unavailable === 'MAINTENANCE'
      ? 'Идут технические работы'
      : unavailable === 'MODULE_DISABLED'
        ? 'Раздел временно недоступен'
        : isServer
          ? 'Сервер временно не отвечает'
          : 'Не удалось загрузить данные';
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center text-center',
        size === 'md' ? 'min-h-56 gap-3 p-8' : 'min-h-32 gap-2 p-6',
        className,
      )}
      {...props}
    >
      <div aria-hidden className="flex size-10 items-center justify-center text-destructive">
        <Icon className="size-6" />
      </div>
      <p className={cn('font-medium', size === 'md' ? 'text-base' : 'text-sm')}>
        {title ?? fallbackTitle}
      </p>
      <p className="max-w-sm text-sm text-muted-foreground">
        {description ?? (error ? getErrorMessage(error) : 'Попробуйте обновить страницу.')}
      </p>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry} loading={retrying}>
          Повторить
        </Button>
      ) : null}
    </div>
  );
}

export interface ForbiddenStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /// Какие права нужны — показываем честно, а не «страница не найдена».
  requiredPermissions?: readonly string[];
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

export function ForbiddenState({
  requiredPermissions,
  title = 'Недостаточно прав',
  description = 'У вашей роли нет доступа к этому разделу. Обратитесь к администратору, если доступ нужен.',
  action,
  className,
  ...props
}: ForbiddenStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex min-h-56 flex-col items-center justify-center gap-3 p-8 text-center',
        className,
      )}
      {...props}
    >
      <div aria-hidden className="flex size-10 items-center justify-center text-warning">
        <ShieldAlert className="size-6" />
      </div>
      <p className="text-base font-medium">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      {requiredPermissions && requiredPermissions.length > 0 ? (
        <p className="text-xs text-subtle-foreground">
          Требуется:{' '}
          {requiredPermissions.map((key, index) => (
            <span key={key}>
              {index > 0 ? ', ' : null}
              <code className="rounded-sm bg-surface-sunken px-1 py-0.5 text-[11px]">{key}</code>
            </span>
          ))}
        </p>
      ) : null}
      {action}
    </div>
  );
}
