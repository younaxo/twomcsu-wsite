'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useState, type ComponentProps } from 'react';
import { IconButton } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

type InputProps = ComponentProps<typeof Input>;

/// Поле пароля с кнопкой «показать/скрыть» (aria-pressed) — общее для входа,
/// регистрации и сброса пароля.
export function PasswordField({
  label,
  hint,
  error,
  required = true,
  labelAddon,
  ...input
}: {
  label: string;
  hint?: React.ReactNode;
  labelAddon?: React.ReactNode;
  error?: React.ReactNode | null;
  required?: boolean;
} & Omit<InputProps, 'type' | 'trailing'>) {
  const [visible, setVisible] = useState(false);
  return (
    <Field label={label} required={required} hint={hint} error={error} labelAddon={labelAddon}>
      <Input
        type={visible ? 'text' : 'password'}
        required={required}
        trailing={
          <IconButton
            type="button"
            size="sm"
            aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'}
            aria-pressed={visible}
            disabled={input.disabled}
            onClick={() => setVisible((value) => !value)}
          >
            {visible ? <EyeOff /> : <Eye />}
          </IconButton>
        }
        {...input}
      />
    </Field>
  );
}
