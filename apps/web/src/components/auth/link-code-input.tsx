'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { LINK_CODE_PATTERN, formatByPattern } from '@/lib/auth/minecraft-code';

/// Поле кода привязки Minecraft (A12): формат `XXX-000-X0X0-0X0`. Верхний
/// регистр, только символы своей позиции (буква/цифра), дефисы — сами;
/// вставка `ABC123A1B23C4` нормализуется. Backspace стирает символ (дефис в
/// конце убирается вместе с ним). Состояния — как у обычного поля.
export interface LinkCodeInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'size'> {
  value: string;
  onValueChange: (value: string) => void;
  invalid?: boolean;
}

export const LinkCodeInput = forwardRef<HTMLInputElement, LinkCodeInputProps>(
  ({ value, onValueChange, invalid, className, ...props }, ref) => (
    <Input
      ref={ref}
      name="minecraft-code"
      autoComplete="one-time-code"
      spellCheck={false}
      autoCapitalize="characters"
      autoCorrect="off"
      inputMode="text"
      maxLength={LINK_CODE_PATTERN.length + 8}
      placeholder={LINK_CODE_PATTERN}
      aria-invalid={invalid || undefined}
      className={cn('font-mono uppercase tracking-[0.15em]', className)}
      value={value}
      onChange={(event) => {
        const raw = event.target.value;
        let next = formatByPattern(raw, LINK_CODE_PATTERN);
        // Стёрли символ сразу после дефиса — убираем и висящий дефис.
        if (raw.length < value.length && next.endsWith('-')) next = next.slice(0, -1);
        onValueChange(next);
      }}
      {...props}
    />
  ),
);
LinkCodeInput.displayName = 'LinkCodeInput';
