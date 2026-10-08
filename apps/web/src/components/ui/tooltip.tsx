'use client';

import { CircleHelp } from 'lucide-react';
import { Tooltip as RadixTooltip } from 'radix-ui';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Kbd } from './kbd';

/// Tooltip — hover + focus (Radix), portal, flip/collision, стрелка, задержка.
/// На touch-устройствах hover-подсказок нет — для важной информации
/// использовать `Toggletip` (открывается нажатием) или текст рядом с UI.
///
/// `TooltipProvider` ставится один раз на корне приложения: общий
/// `delayDuration` и «skip delay» между соседними подсказками.

export const TooltipProvider = RadixTooltip.Provider;
export const TooltipRoot = RadixTooltip.Root;
export const TooltipTrigger = RadixTooltip.Trigger;

export const tooltipContentClassName = cn(
  'z-50 max-w-[min(20rem,calc(100vw-2rem))] rounded-sm glass-frosted-strong px-2.5 py-1.5 text-xs leading-snug text-foreground',
  'data-[state=delayed-open]:animate-fade-in data-[state=closed]:animate-fade-out',
  '[--pop-y:2px] data-[side=top]:[--pop-y:2px] data-[side=bottom]:[--pop-y:-2px]',
);

export const TooltipContent = forwardRef<
  ElementRef<typeof RadixTooltip.Content>,
  ComponentPropsWithoutRef<typeof RadixTooltip.Content> & { arrow?: boolean }
>(({ className, sideOffset = 6, collisionPadding = 8, arrow = true, children, ...props }, ref) => (
  <RadixTooltip.Portal>
    <RadixTooltip.Content
      ref={ref}
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      className={cn(tooltipContentClassName, className)}
      {...props}
    >
      {children}
      {arrow ? (
        <RadixTooltip.Arrow
          className="[fill:rgb(var(--glass-surface)/0.92)]"
          width={10}
          height={5}
        />
      ) : null}
    </RadixTooltip.Content>
  </RadixTooltip.Portal>
));
TooltipContent.displayName = 'TooltipContent';

export interface TooltipProps {
  /// Текст простой подсказки или произвольный контент (rich).
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  /// Переопределить задержку провайдера для конкретной подсказки.
  delayDuration?: number;
  /// Сочетание клавиш, показывается справа от текста: ['⌘', 'K'] или ['Ctrl', 'K'].
  shortcut?: string[];
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  /// Если триггер уже является кнопкой/ссылкой — true (по умолчанию).
  asChild?: boolean;
}

/// Простая подсказка: `<Tooltip content="Удалить"><IconButton …/></Tooltip>`.
/// С `shortcut` — подсказка с сочетанием клавиш. С JSX в `content` — rich.
export function Tooltip({
  content,
  children,
  side = 'top',
  align = 'center',
  delayDuration,
  shortcut,
  open,
  defaultOpen,
  onOpenChange,
  className,
  asChild = true,
}: TooltipProps) {
  return (
    <RadixTooltip.Root
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
      delayDuration={delayDuration}
    >
      <RadixTooltip.Trigger asChild={asChild}>{children}</RadixTooltip.Trigger>
      <TooltipContent side={side} align={align} className={className}>
        {shortcut ? (
          <span className="flex items-center gap-2">
            <span>{content}</span>
            <span className="flex gap-0.5" aria-label={`Сочетание клавиш ${shortcut.join(' ')}`}>
              {shortcut.map((key) => (
                <Kbd key={key} inverted>
                  {key}
                </Kbd>
              ))}
            </span>
          </span>
        ) : (
          content
        )}
      </TooltipContent>
    </RadixTooltip.Root>
  );
}

export interface RichTooltipProps extends Omit<TooltipProps, 'content' | 'shortcut'> {
  title: ReactNode;
  description?: ReactNode;
}

/// Расширенная подсказка: заголовок + описание. Для интерактивного контента
/// (кнопки/ссылки внутри) используйте `Popover`/`HoverCard` — tooltip не
/// получает фокус.
export function RichTooltip({ title, description, className, ...props }: RichTooltipProps) {
  return (
    <Tooltip
      className={cn('max-w-xs px-3 py-2', className)}
      content={
        <span className="block">
          <span className="block font-medium">{title}</span>
          {description ? (
            <span className="mt-0.5 block text-background/80">{description}</span>
          ) : null}
        </span>
      }
      {...props}
    />
  );
}

export interface HelpTooltipProps {
  /// Что объяснить: короткий текст рядом с подписью поля/заголовком.
  content: ReactNode;
  /// Доступное имя кнопки, по умолчанию «Подсказка».
  label?: string;
  side?: TooltipProps['side'];
  className?: string;
}

/// Иконка «?» рядом с подписью; открывается по hover и по фокусу (это кнопка).
export function HelpTooltip({ content, label = 'Подсказка', side, className }: HelpTooltipProps) {
  return (
    <Tooltip content={content} side={side}>
      <button
        type="button"
        aria-label={label}
        className={cn(
          'inline-flex size-5 items-center justify-center rounded-full text-subtle-foreground hover:text-foreground',
          className,
        )}
      >
        <CircleHelp aria-hidden className="size-4" />
      </button>
    </Tooltip>
  );
}

export interface ValidationTooltipProps {
  /// Текст ошибки; `null` — подсказка скрыта и поле валидно.
  error: ReactNode | null;
  children: ReactNode;
  side?: TooltipProps['side'];
}

/// Подсказка-ошибка у компактных полей (таблицы, inline-редактирование), где
/// нет места под текст ошибки. Открыта, пока есть ошибка; поле получает
/// `aria-invalid`, а текст ошибки дублируется для screen reader через
/// `aria-describedby` внутри `Field` — tooltip лишь визуализация.
export function ValidationTooltip({ error, children, side = 'bottom' }: ValidationTooltipProps) {
  return (
    <RadixTooltip.Root open={error !== null && error !== undefined}>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <TooltipContent
        side={side}
        role="alert"
        className="bg-destructive text-destructive-foreground"
        arrow={false}
      >
        {error}
      </TooltipContent>
    </RadixTooltip.Root>
  );
}
