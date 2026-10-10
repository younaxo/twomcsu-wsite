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

  it('без нативного number: type=text + inputMode=numeric + pattern; one-time-code на первой ячейке', () => {
    render(<Harness />);
    for (let n = 1; n <= 6; n += 1) {
      expect(cell(n)).toHaveAttribute('type', 'text');
      expect(cell(n)).toHaveAttribute('inputmode', 'numeric');
      expect(cell(n)).toHaveAttribute('pattern', '[0-9]*');
    }
    expect(cell(1)).toHaveAttribute('autocomplete', 'one-time-code');
    expect(document.querySelector('input[type="number"]')).toBeNull();
  });

  it('стрелки, Home/End, Delete; новая цифра заменяет старую; на пустую ячейку дальше первой пустой не встать', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.keyboard('123');
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(cell(2)).toHaveFocus();
    await user.keyboard('9');
    expect(screen.getByTestId('code')).toHaveTextContent(/^193$/);
    await user.keyboard('{Home}');
    expect(cell(1)).toHaveFocus();
    await user.keyboard('{Delete}');
    expect(screen.getByTestId('code')).toHaveTextContent(/^93$/);
    await user.keyboard('{End}');
    expect(cell(3)).toHaveFocus();
    await user.click(cell(6));
    expect(cell(3)).toHaveFocus();
  });

  it('состояния: invalid, success, loading (ячейки недоступны, aria-busy), disabled', () => {
    const { rerender } = render(<OtpInput value="12" invalid />);
    const group = screen.getByRole('group', { name: 'Код подтверждения' });
    expect(group).toHaveAttribute('data-state', 'invalid');
    expect(cell(1)).toHaveAttribute('aria-invalid', 'true');
    rerender(<OtpInput value="123456" success />);
    expect(group).toHaveAttribute('data-state', 'success');
    rerender(<OtpInput value="123456" loading />);
    expect(group).toHaveAttribute('data-state', 'loading');
    expect(group).toHaveAttribute('aria-busy', 'true');
    expect(cell(1)).toBeDisabled();
    rerender(<OtpInput disabled />);
    expect(cell(6)).toBeDisabled();
  });

  it('неконтролируемый режим и скрытое поле для формы', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<OtpInput autoFocus name="code" length={4} onComplete={onComplete} />);
    await user.keyboard('4321');
    expect(onComplete).toHaveBeenCalledWith('4321');
    expect(document.querySelector('input[type="hidden"][name="code"]')).toHaveValue('4321');
  });
});

describe('OtpInput с шаблоном (A12)', () => {
  it('X0XX0: буквы и цифры по позициям, верхний регистр, вставка, неверные символы отброшены', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<OtpInput autoFocus pattern="X0XX0" onComplete={onComplete} aria-label="Код подтверждения Minecraft" />);
    const first = screen.getByLabelText('Код, символ 1');
    expect(first).toHaveFocus();
    expect(first).toHaveAttribute('inputmode', 'text');
    expect(screen.getByLabelText('Код, символ 2')).toHaveAttribute('inputmode', 'numeric');
    await user.keyboard('1a');
    // «1» на месте буквы не принимается; «a» → «A».
    expect(first).toHaveValue('A');
    // Целый валидный код вставляется с начала, заменяя ввод.
    await user.paste('b2cd3');
    expect(onComplete).toHaveBeenLastCalledWith('B2CD3');
    await user.click(first);
    await user.paste('a1bc2');
    expect(onComplete).toHaveBeenCalledWith('A1BC2');
    expect(screen.getAllByRole('textbox')).toHaveLength(5);
  });
});
