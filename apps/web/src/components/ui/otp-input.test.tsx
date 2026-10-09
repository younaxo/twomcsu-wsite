import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { OtpInput } from './otp-input';

/// Поле кода как на шаге подтверждения почты: «проверка» блокирует ячейки,
/// неверный код очищает поле.
function Harness({ onComplete }: { onComplete?: (value: string) => void }) {
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  return (
    <div>
      <OtpInput
        autoFocus
        value={code}
        onChange={setCode}
        onComplete={(value) => {
          onComplete?.(value);
          setPending(true);
        }}
        disabled={pending}
      />
      <output data-testid="code">{code}</output>
      <button
        type="button"
        onClick={() => {
          setCode('');
          setPending(false);
        }}
      >
        Неверный код
      </button>
    </div>
  );
}

const cell = (n: number) => screen.getByLabelText(`Код, цифра ${n}`);

describe('OtpInput', () => {
  it('автофокус на первой ячейке, автопереход, только цифры, onComplete с полным кодом', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);
    expect(screen.getByRole('group', { name: 'Код подтверждения' })).toBeInTheDocument();
    expect(cell(1)).toHaveFocus();
    await user.keyboard('1a2');
    expect(screen.getByTestId('code')).toHaveTextContent(/^12$/);
    expect(cell(3)).toHaveFocus();
    await user.keyboard('3456');
    expect(onComplete).toHaveBeenCalledWith('123456');
  });

  it('вставка целого кода заполняет все ячейки', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);
    await user.paste('987654');
    expect(onComplete).toHaveBeenCalledWith('987654');
    expect(cell(6)).toHaveValue('4');
  });

  it('Backspace стирает предыдущую цифру одним нажатием', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.keyboard('12');
    expect(cell(3)).toHaveFocus();
    await user.keyboard('{Backspace}');
    expect(screen.getByTestId('code')).toHaveTextContent(/^1$/);
    expect(cell(2)).toHaveFocus();
    await user.keyboard('3');
    expect(screen.getByTestId('code')).toHaveTextContent(/^13$/);
    await user.keyboard('{Backspace}{Backspace}');
    expect(screen.getByTestId('code')).toBeEmptyDOMElement();
    expect(cell(1)).toHaveFocus();
  });

  it('после проверки и сброса фокус возвращается в первую ячейку', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.keyboard('000000');
    // На время проверки ячейки заблокированы и теряют фокус.
    expect(cell(1)).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Неверный код' }));
    expect(cell(1)).toHaveFocus();
    await user.keyboard('1');
    expect(screen.getByTestId('code')).toHaveTextContent(/^1$/);
  });
});
