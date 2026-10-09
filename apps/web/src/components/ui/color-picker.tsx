'use client';

import { ChevronDown } from 'lucide-react';
import { Popover } from 'radix-ui';
import { forwardRef, useId, useState, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { Button } from './button';
import { Input } from './input';
import { selectTriggerVariants } from './select';

/// ColorPicker-прототип для цвета роли: набор готовых цветов (`presets`,
/// приходят из домена — компонент не держит собственных hex) + произвольный
/// цвет через нативный `<input type="color">` и поле HEX с валидацией.
/// Значение — `#rrggbb` в нижнем регистре или `null`.

export const HEX_PATTERN = /^#[0-9a-f]{6}$/i;

export interface ColorPickerProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'value' | 'onChange' | 'defaultValue'
> {
  value: string | null;
  onChange: (value: string | null) => void;
  /// Готовые цвета (hex). Подписи для aria-label — в `presetLabels`.
  presets?: string[];
  presetLabels?: Record<string, string>;
  /// Разрешить произвольный цвет (нативный пикер + HEX-поле).
  allowCustom?: boolean;
  clearable?: boolean;
  invalid?: boolean;
  placeholder?: string;
  size?: 'sm' | 'md' | 'lg';
}

function normalize(hex: string): string {
  return hex.trim().toLowerCase();
}

export const ColorPicker = forwardRef<HTMLButtonElement, ColorPickerProps>(
  (
    {
      value,
      onChange,
      presets = [],
      presetLabels,
      allowCustom = true,
      clearable = true,
      invalid,
      placeholder = 'Выберите цвет',
      size,
      className,
      disabled,
      /// Кнопка не поддерживает aria-invalid — ошибка связывается через aria-describedby
      /// (Field), а визуально — через data-invalid.
      'aria-invalid': ariaInvalid,
      ...props
    },
    ref,
  ) => {
    const hexErrorId = useId();
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState('');
    const [editing, setEditing] = useState(false);
    const current = value ? normalize(value) : null;
    const displayedHex = editing ? draft : (current ?? '');
    const draftInvalid = editing && draft.trim() !== '' && !HEX_PATTERN.test(draft.trim());
    /// Нативному color-input нужен валидный hex даже при пустом значении —
    /// берём первый preset, а без него нейтральный чёрный (это не цвет дизайна).
    const nativeValue = current ?? (presets[0] ? normalize(presets[0]) : '#000000');

    return (
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            ref={ref}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={open}
            data-invalid={
              invalid || ariaInvalid === true || ariaInvalid === 'true' ? '' : undefined
            }
            data-placeholder={current ? undefined : ''}
            disabled={disabled}
            className={cn(selectTriggerVariants({ size }), className)}
            {...props}
          >
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span
                aria-hidden
                className={cn(
                  'size-4 shrink-0 rounded-sm border border-border-strong/40',
                  !current && 'bg-surface-sunken',
                )}
                style={current ? { backgroundColor: current } : undefined}
              />
              <span className={cn('truncate', current && 'font-mono uppercase tabular')}>
                {current ?? placeholder}
              </span>
            </span>
            <ChevronDown aria-hidden className="text-subtle-foreground" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={4}
            collisionPadding={8}
            className={cn(
              'z-50 flex w-64 max-w-[calc(100vw-2rem)] flex-col gap-3 p-3',
              'rounded-lg border bg-surface-overlay text-foreground shadow-lg edge-highlight',
              'data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out',
              'data-[side=bottom]:[--pop-y:-4px] data-[side=top]:[--pop-y:4px]',
            )}
          >
            {presets.length > 0 ? (
              <div role="group" aria-label="Готовые цвета" className="grid grid-cols-6 gap-1.5">
                {presets.map((preset) => {
                  const hex = normalize(preset);
                  const pressed = hex === current;
                  return (
                    <button
                      key={hex}
                      type="button"
                      aria-label={presetLabels?.[preset] ?? presetLabels?.[hex] ?? hex}
                      aria-pressed={pressed}
                      onClick={() => onChange(hex)}
                      style={{ backgroundColor: hex }}
                      className={cn(
                        'size-7 rounded-sm border border-border-strong/40',
                        'transition-[box-shadow] duration-fast',
                        'hover:ring-2 hover:ring-border-strong hover:ring-offset-1 hover:ring-offset-surface-overlay',
                        'aria-pressed:ring-2 aria-pressed:ring-ring aria-pressed:ring-offset-2 aria-pressed:ring-offset-surface-overlay',
                      )}
                    />
                  );
                })}
              </div>
            ) : null}

            {allowCustom ? (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label="Свой цвет"
                    value={nativeValue}
                    onChange={(event) => onChange(normalize(event.target.value))}
                    className={cn(
                      'size-[var(--control-h-sm)] shrink-0 cursor-pointer rounded-sm border border-border-strong bg-transparent p-0.5',
                      '[&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-sm [&::-webkit-color-swatch]:border-0',
                      '[&::-moz-color-swatch]:rounded-sm [&::-moz-color-swatch]:border-0',
                    )}
                  />
                  <Input
                    size="sm"
                    aria-label="HEX-код цвета"
                    aria-describedby={draftInvalid ? hexErrorId : undefined}
                    invalid={draftInvalid}
                    value={displayedHex}
                    placeholder="#RRGGBB"
                    maxLength={7}
                    spellCheck={false}
                    autoCapitalize="off"
                    className="font-mono uppercase tabular"
                    onFocus={() => {
                      setDraft(current ?? '');
                      setEditing(true);
                    }}
                    onChange={(event) => {
                      const next = event.target.value;
                      setDraft(next);
                      if (HEX_PATTERN.test(next.trim())) {
                        onChange(normalize(next));
                      }
                    }}
                    onBlur={() => setEditing(false)}
                  />
                </div>
                {draftInvalid ? (
                  <p id={hexErrorId} role="alert" className="text-xs text-destructive">
                    Формат: «#» и шесть символов 0–9, A–F.
                  </p>
                ) : null}
              </div>
            ) : null}

            {clearable && current ? (
              <div className="flex justify-end border-t border-border-subtle pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                >
                  Без цвета
                </Button>
              </div>
            ) : null}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    );
  },
);
ColorPicker.displayName = 'ColorPicker';
