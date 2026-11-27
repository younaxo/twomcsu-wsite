'use client';

import { UserRound } from 'lucide-react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { Textarea, type TextareaProps } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { useMentionAutocomplete } from './use-mention-autocomplete';

export interface MentionTextareaProps extends TextareaProps {
  value: string;
  /// Класс обёртки (например, `flex-1` внутри flex-формы).
  wrapperClassName?: string;
}

function setNativeValue(el: HTMLTextAreaElement, next: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(el, next);
}

/// Textarea с автодополнением `@ник`. Фокус остаётся в поле; значение остаётся
/// у родителя: вставка идёт через штатное событие `input`, поэтому `onChange`
/// родителя отрабатывает как при обычном вводе. Когда список закрыт, клавиши
/// уходят родителю как раньше (Enter отправляет сообщение).
export const MentionTextarea = forwardRef<HTMLTextAreaElement, MentionTextareaProps>(
  ({ wrapperClassName, value, onKeyDown, onChange, onSelect, onClick, onKeyUp, ...props }, ref) => {
    const inner = useRef<HTMLTextAreaElement>(null);
    useImperativeHandle(ref, () => inner.current as HTMLTextAreaElement);

    const commit = useCallback((next: string, caret: number) => {
      const el = inner.current;
      if (!el) return;
      setNativeValue(el, next);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.focus();
      el.setSelectionRange(caret, caret);
    }, []);

    const mention = useMentionAutocomplete({ value, commit, maxLength: props.maxLength });

    // Radix Dialog/Sheet слушает Esc на document в capture-фазе, раньше React.
    // Пока список открыт, перехватываем Esc на window (ещё раньше), закрываем
    // только список и не пускаем событие к модальному слою.
    const { open: listOpen, close: closeList } = mention;
    useEffect(() => {
      if (!listOpen) return;
      const onEscape = (event: KeyboardEvent) => {
        if (event.key !== 'Escape' || event.target !== inner.current) return;
        if (event.isComposing || event.keyCode === 229) return;
        event.preventDefault();
        event.stopPropagation();
        closeList();
      };
      window.addEventListener('keydown', onEscape, true);
      return () => window.removeEventListener('keydown', onEscape, true);
    }, [listOpen, closeList]);
    const syncCaret = () => {
      const el = inner.current;
      if (el) mention.setCaret(el.selectionStart ?? 0);
    };

    return (
      <div className={cn('relative min-w-0', wrapperClassName)}>
        <Textarea
          {...props}
          ref={inner}
          value={value}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={mention.open}
          aria-haspopup="listbox"
          aria-controls={mention.listboxId}
          aria-activedescendant={mention.activeOptionId}
          onChange={(event) => {
            mention.setCaret(event.target.selectionStart ?? event.target.value.length);
            onChange?.(event);
          }}
          onKeyDown={(event) => {
            if (
              mention.handleKeyDown({
                key: event.key,
                shiftKey: event.shiftKey,
                isComposing: event.nativeEvent.isComposing,
                keyCode: event.keyCode,
                preventDefault: () => event.preventDefault(),
              })
            ) {
              return;
            }
            onKeyDown?.(event);
          }}
          onKeyUp={(event) => {
            syncCaret();
            onKeyUp?.(event);
          }}
          onClick={(event) => {
            syncCaret();
            onClick?.(event);
          }}
          onSelect={(event) => {
            syncCaret();
            onSelect?.(event);
          }}
        />
        <div aria-live="polite" role="status" className="sr-only" data-testid="mention-status">
          {mention.status}
        </div>
        <ul
          hidden={!mention.open}
          id={mention.listboxId}
          role="listbox"
          aria-label="Игроки"
          data-testid="mention-listbox"
          className="absolute inset-x-0 bottom-full z-30 mb-1 max-h-60 overflow-y-auto rounded border border-border bg-surface p-1 shadow-md"
        >
          {mention.error ? (
            <li role="presentation" className="px-3 py-2 text-sm text-muted-foreground">
              {mention.error}
            </li>
          ) : null}
          {mention.items.map((item, index) => (
            <li
              key={item.username}
              id={mention.optionId(index)}
              role="option"
              aria-selected={index === mention.activeIndex}
              // mousedown не отбирает фокус у поля
              onMouseDown={(event) => {
                event.preventDefault();
                mention.select(item);
              }}
              onMouseEnter={() => mention.setActiveIndex(index)}
              className={cn(
                'flex min-h-10 cursor-pointer items-center gap-2 rounded px-3 text-sm text-foreground',
                index === mention.activeIndex ? 'bg-primary/15' : 'hover:bg-surface-sunken',
              )}
            >
              <UserRound aria-hidden className="size-4 shrink-0 text-subtle-foreground" />
              <span className="min-w-0 truncate">{item.username}</span>
              {item.tag ? (
                <span className="shrink-0 text-xs text-subtle-foreground">[{item.tag}]</span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    );
  },
);
MentionTextarea.displayName = 'MentionTextarea';
