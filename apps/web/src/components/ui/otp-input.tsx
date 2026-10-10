'use client';

import { Check, Loader2 } from 'lucide-react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type HTMLAttributes,
  type KeyboardEvent,
} from 'react';
import { cn } from '@/lib/cn';

/// OtpInput «Полдня» (ADR-0087) — собственный ввод кода: по одной цифре в
/// стилизованную ячейку. Без числового type и без нативных стрелок: каждая
/// ячейка — `type="text"` + `inputMode="numeric"` (цифровая клавиатура на
/// телефоне) + `pattern`, нецифры отбрасываются.
///
/// Поведение: ввод переводит фокус дальше; вставка (или автозаполнение
/// `one-time-code`) раскладывает весь код; Backspace стирает текущую или
/// предыдущую цифру одним нажатием; Delete — текущую; ←/→/Home/End — переход.
/// Код всегда непрерывный: фокус на пустой ячейке дальше первой пустой
/// переводится на первую пустую.
///
/// Состояния: `invalid`, `success`, `loading` (ячейки недоступны + индикатор),
/// `disabled`. `id` и `aria-label` — на группе; `aria-describedby` и
/// `aria-invalid` — на каждой ячейке (так `Field` связывает ошибку с полем).

export interface OtpInputProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'onChange' | 'defaultValue' | 'aria-invalid' | 'children'
> {
  /// Количество цифр (по умолчанию 6).
  length?: number;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /// Вызывается, когда введены все цифры.
  onComplete?: (value: string) => void;
  invalid?: boolean;
  success?: boolean;
  loading?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  size?: 'md' | 'lg';
  /// Имя скрытого input для нативной отправки формы.
  name?: string;
  /// Шаблон кода (A12): `X` — буква A–Z, `0` — цифра; например `X0XX0`.
  /// Длина = длине шаблона, буквы — в верхний регистр. Без шаблона — цифры.
  pattern?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
}

const cellSizeClass = {
  md: 'h-12 w-10 text-lg',
  lg: 'h-14 w-12 text-2xl',
} as const;


export const OtpInput = forwardRef<HTMLDivElement, OtpInputProps>(
  (
    {
      length: lengthProp = 6,
      pattern,
      value,
      defaultValue = '',
      onChange,
      onComplete,
      invalid,
      success = false,
      loading = false,
      disabled = false,
      autoFocus = false,
      size = 'md',
      name,
      className,
      'aria-label': ariaLabel = 'Код подтверждения',
      'aria-describedby': describedBy,
      'aria-invalid': ariaInvalid,
      ...props
    },
    ref,
  ) => {
    const length = pattern?.length ?? lengthProp;
    // Допустимый символ позиции: по шаблону (буква/цифра) или цифра.
    const accept = (char: string, position: number) => {
      const slot = pattern?.[position];
      if (!pattern) return /^\d$/.test(char);
      return slot === 'X' ? /^[A-Z]$/.test(char) : slot === '0' ? /^\d$/.test(char) : false;
    };
    // Ввод с позиции `start`: чужие символы отбрасываются, буквы — в верхний регистр.
    const sanitize = (raw: string, start = 0) => {
      let out = '';
      for (const char of raw.toUpperCase()) {
        if (start + out.length >= length) break;
        if (accept(char, start + out.length)) out += char;
      }
      return out;
    };
    const [inner, setInner] = useState(() => sanitize(defaultValue));
    const code = sanitize(value ?? inner);
    const cells = useRef<(HTMLInputElement | null)[]>([]);
    // Актуальный код для обработчиков фокуса: commit обновляет его сразу,
    // не дожидаясь нового рендера.
    const latest = useRef(code);
    latest.current = code;
    const isInvalid = !!invalid || ariaInvalid === true || ariaInvalid === 'true';
    const locked = disabled || loading;

    const focusCell = useCallback(
      (index: number) => {
        const target = cells.current[Math.max(0, Math.min(length - 1, index))];
        target?.focus();
        target?.select();
      },
      [length],
    );

    const commit = (next: string, focusAt?: number) => {
      const clean = sanitize(next);
      latest.current = clean;
      if (value === undefined) setInner(clean);
      if (clean !== code) {
        onChange?.(clean);
        if (clean.length === length) onComplete?.(clean);
      }
      if (focusAt !== undefined) {
        focusCell(focusAt);
      }
    };

    // Автофокус: при монтировании и каждый раз, когда поле снова доступно и
    // пустое (после неверного кода или повторной отправки).
    const empty = code === '';
    useEffect(() => {
      if (!autoFocus || locked || !empty) return;
      focusCell(0);
    }, [autoFocus, locked, empty, focusCell]);

    const insert = (index: number, raw: string) => {
      const at = Math.min(index, code.length);
      const digits = sanitize(raw, at);
      if (!digits) return;
      const next = (code.slice(0, at) + digits + code.slice(at + digits.length)).slice(0, length);
      commit(next, Math.min(at + digits.length, length - 1));
    };

    const onKeyDown = (index: number) => (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      switch (event.key) {
        case 'Backspace': {
          event.preventDefault();
          if (index < code.length) {
            commit(code.slice(0, index) + code.slice(index + 1), index);
          } else if (index > 0) {
            commit(code.slice(0, index - 1) + code.slice(index), index - 1);
          }
          break;
        }
        case 'Delete': {
          event.preventDefault();
          if (index < code.length) commit(code.slice(0, index) + code.slice(index + 1), index);
          break;
        }
        case 'ArrowLeft':
          event.preventDefault();
          focusCell(index - 1);
          break;
        case 'ArrowRight':
          event.preventDefault();
          focusCell(Math.min(index + 1, code.length));
          break;
        case 'Home':
          event.preventDefault();
          focusCell(0);
          break;
        case 'End':
          event.preventDefault();
          focusCell(Math.min(code.length, length - 1));
          break;
        default:
          if (
            event.key.length === 1 &&
            !accept(event.key.toUpperCase(), Math.min(index, code.length))
          ) {
            event.preventDefault();
          }
      }
    };

    const onPaste = (index: number) => (event: ClipboardEvent<HTMLInputElement>) => {
      event.preventDefault();
      const text = event.clipboardData.getData('text');
      // Целый код вставляем с начала, часть — с текущей ячейки.
      insert(sanitize(text).length >= length ? 0 : index, text);
    };

    return (
      <div
        ref={ref}
        role="group"
        aria-label={ariaLabel}
        aria-busy={loading || undefined}
        data-state={loading ? 'loading' : success ? 'success' : isInvalid ? 'invalid' : 'idle'}
        className={cn('flex max-w-full items-center gap-2', className)}
        {...props}
      >
        {Array.from({ length }, (_, index) => {
          const char = code[index] ?? '';
          return (
            <input
              key={index}
              ref={(node) => {
                cells.current[index] = node;
              }}
              type="text"
              inputMode={pattern && pattern[index] !== '0' ? 'text' : 'numeric'}
              pattern={pattern ? (pattern[index] === '0' ? '[0-9]' : '[A-Za-z]') : '[0-9]*'}
              autoCapitalize={pattern ? 'characters' : undefined}
              autoComplete={index === 0 ? 'one-time-code' : 'off'}
              maxLength={length}
              value={char}
              disabled={locked}
              aria-label={`Код, ${pattern ? 'символ' : 'цифра'} ${index + 1}`}
              aria-invalid={isInvalid || undefined}
              aria-describedby={describedBy}
              data-filled={char ? '' : undefined}
              onChange={(event) => {
                let raw = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                // Каретка стояла рядом с уже введённой цифрой — ячейка получила
                // две; новая цифра заменяет старую, а не сдвигает код.
                if (char && raw.length === 2) raw = raw[0] === char ? raw[1]! : raw[0]!;
                insert(index, raw);
              }}
              onKeyDown={onKeyDown(index)}
              onPaste={onPaste(index)}
              onFocus={(event) => {
                if (index > latest.current.length) {
                  focusCell(latest.current.length);
                  return;
                }
                event.target.select();
              }}
              className={cn(
                'shrink-0 rounded-lg border bg-background-subtle text-center font-mono font-semibold tabular-nums text-foreground caret-primary',
                'transition-[border-color,box-shadow,background-color] duration-fast',
                'border-border-subtle hover:border-border data-[filled]:border-border',
                'focus-visible:border-primary/60 focus-visible:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20',
                'disabled:cursor-not-allowed disabled:opacity-60',
                isInvalid &&
                  'border-destructive data-[filled]:border-destructive focus-visible:border-destructive focus-visible:ring-destructive/30',
                success && 'border-success data-[filled]:border-success',
                cellSizeClass[size],
              )}
            />
          );
        })}
        <span aria-hidden className="flex size-5 shrink-0 items-center justify-center">
          {loading ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : success ? (
            <Check className="size-4 text-success" />
          ) : null}
        </span>
        {name ? <input type="hidden" name={name} value={code} /> : null}
      </div>
    );
  },
);
OtpInput.displayName = 'OtpInput';
