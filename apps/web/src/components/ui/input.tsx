'use client';

import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/cn';

export const inputClassName = cn(
  'flex w-full min-w-0 rounded border border-border bg-surface px-control-px text-sm text-foreground',
  'placeholder:text-subtle-foreground',
  'transition-[border-color,box-shadow] duration-fast',
  'hover:border-border-strong',
  'focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
  'aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive/30',
  'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:opacity-60',
  'read-only:bg-surface-sunken',
);

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: 'sm' | 'md' | 'lg';
  /// Иконка/элемент слева внутри поля (например лупа).
  leading?: ReactNode;
  /// Элемент справа (счётчик, кнопка очистки, спиннер).
  trailing?: ReactNode;
  invalid?: boolean;
}

const sizeClass = {
  sm: 'h-control-sm text-sm',
  md: 'h-control',
  lg: 'h-control-lg text-base',
} as const;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, size = 'md', leading, trailing, invalid, ...props }, ref) => {
    const input = (
      <input
        ref={ref}
        aria-invalid={invalid || props['aria-invalid'] || undefined}
        className={cn(
          inputClassName,
          sizeClass[size],
          leading ? 'pl-9' : null,
          trailing ? 'pr-9' : null,
          className,
        )}
        {...props}
      />
    );
    if (!leading && !trailing) {
      return input;
    }
    return (
      <div className="relative flex w-full items-center">
        {leading ? (
          <span
            aria-hidden
            className="pointer-events-none absolute left-3 inline-flex text-subtle-foreground [&_svg]:size-4"
          >
            {leading}
          </span>
        ) : null}
        {input}
        {trailing ? (
          <span className="absolute right-2 inline-flex items-center text-subtle-foreground [&_svg]:size-4">
            {trailing}
          </span>
        ) : null}
      </div>
    );
  },
);
Input.displayName = 'Input';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid, rows = 4, ...props }, ref) => (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || props['aria-invalid'] || undefined}
      className={cn(inputClassName, 'min-h-control resize-y py-2 leading-normal', className)}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';
