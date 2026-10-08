import { Info, Lightbulb, TriangleAlert } from 'lucide-react';
import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/// Hint — НЕ floating: контекстная подсказка прямо в разметке рядом с UI
/// (пояснение к фильтру, к настройке, к пустому списку). Видна всегда,
/// работает на touch и для screen reader без дополнительных действий.
/// Для подсказки по наведению — `Tooltip`, по нажатию — `Toggletip`.
/// Server-safe: без хуков и событий.

export type HintTone = 'neutral' | 'info' | 'warning';

/// Тон задаёт иконку и её цвет; текст остаётся muted, чтобы цвет не был
/// единственным носителем смысла и контраст мелкого текста не страдал.
const TONE: Record<HintTone, { icon: ReactNode; iconClass: string }> = {
  neutral: { icon: <Lightbulb aria-hidden />, iconClass: 'text-subtle-foreground' },
  info: { icon: <Info aria-hidden />, iconClass: 'text-info' },
  warning: { icon: <TriangleAlert aria-hidden />, iconClass: 'text-warning' },
};

export interface HintProps extends HTMLAttributes<HTMLDivElement> {
  tone?: HintTone;
  /// Своя иконка вместо иконки тона.
  icon?: ReactNode;
  children: ReactNode;
}

export const Hint = forwardRef<HTMLDivElement, HintProps>(
  ({ tone = 'neutral', icon, className, children, ...props }, ref) => {
    const meta = TONE[tone];
    return (
      <div
        ref={ref}
        role="note"
        className={cn('flex items-start gap-2 text-sm text-muted-foreground', className)}
        {...props}
      >
        <span
          aria-hidden
          className={cn('mt-0.5 inline-flex shrink-0 [&_svg]:size-4', meta.iconClass)}
        >
          {icon ?? meta.icon}
        </span>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    );
  },
);
Hint.displayName = 'Hint';

export interface InlineHintProps extends HTMLAttributes<HTMLParagraphElement> {
  tone?: HintTone;
  /// Своя иконка; у `neutral` иконки нет, у `info`/`warning` — по тону.
  icon?: ReactNode;
}

/// Подпись под полем: формат, пример, ограничение. Передайте `id` и укажите
/// его в `aria-describedby` контрола (`Field` с пропом `hint` делает это сам).
export const InlineHint = forwardRef<HTMLParagraphElement, InlineHintProps>(
  ({ tone = 'neutral', icon, className, children, ...props }, ref) => {
    const meta = TONE[tone];
    const resolvedIcon = icon ?? (tone === 'neutral' ? null : meta.icon);
    return (
      <p
        ref={ref}
        className={cn('flex items-start gap-1.5 text-xs text-muted-foreground', className)}
        {...props}
      >
        {resolvedIcon ? (
          <span
            aria-hidden
            className={cn('mt-px inline-flex shrink-0 [&_svg]:size-3.5', meta.iconClass)}
          >
            {resolvedIcon}
          </span>
        ) : null}
        <span>{children}</span>
      </p>
    );
  },
);
InlineHint.displayName = 'InlineHint';
