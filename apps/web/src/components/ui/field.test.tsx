import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Field } from './field';
import { Input } from './input';

describe('Field', () => {
  it('связывает подпись с контролом и подсказку через aria-describedby', () => {
    render(
      <Field label="Email" hint="Например, steve@example.com" required>
        <Input type="email" />
      </Field>,
    );
    const input = screen.getByLabelText(/Email/);
    expect(input).toHaveAttribute('type', 'email');
    expect(input).toHaveAttribute('aria-required', 'true');
    expect(input).toHaveAccessibleDescription('Например, steve@example.com');
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('ошибка: aria-invalid, role=alert и текст ошибки вместо подсказки', () => {
    render(
      <Field label="Ник" hint="До 16 символов" error="Ник уже занят">
        <Input />
      </Field>,
    );
    const input = screen.getByLabelText('Ник');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Ник уже занят');
    expect(input).toHaveAccessibleDescription('Ник уже занят');
    expect(screen.queryByText('До 16 символов')).toBeNull();
  });

  it('уважает собственный id контрола', () => {
    render(
      <Field label="Пароль">
        <Input id="password" type="password" />
      </Field>,
    );
    expect(screen.getByLabelText('Пароль')).toHaveAttribute('id', 'password');
  });
});
