import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from './dialog';
import { ColorPicker, hexToHsv, hsvToHex } from './color-picker';

function Harness({ initial = null }: { initial?: string | null }) {
  const [value, setValue] = useState<string | null>(initial);
  return (
    <div>
      <button type="button">Снаружи</button>
      <ColorPicker aria-label="Цвет" value={value} onChange={setValue} />
      <output data-testid="value">{value ?? 'null'}</output>
    </div>
  );
}

describe('ColorPicker', () => {
  it('открывается по клику без нативного color dialog, показывает пресеты, HEX и «Без цвета»', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Цвет' }));
    const panel = await screen.findByTestId('color-panel');
    expect(panel.querySelector('input[type="color"]')).toBeNull();
    expect(document.querySelector('input[type="color"]')).toBeNull();
    expect(within(panel).getByRole('group', { name: 'Готовые цвета' })).toBeInTheDocument();
    expect(within(panel).getByRole('textbox', { name: 'HEX-код цвета' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Без цвета' })).toBeDisabled();
    expect(within(panel).getByText('Цвет не выбран')).toBeInTheDocument();
  });

  it('выбор пресета обновляет значение, превью и selected state', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Цвет' }));
    const green = await screen.findByRole('button', { name: 'Зелёный' });
    await user.click(green);
    expect(screen.getByTestId('value')).toHaveTextContent('#30a46c');
    expect(green).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Оранжевый' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByTestId('color-preview')).toHaveStyle({ backgroundColor: '#30a46c' });
    expect(screen.getByRole('button', { name: 'Цвет' })).toHaveTextContent('#30a46c');
  });

  it('ввод HEX: валидный применяется сразу, невалидный показывает ошибку и не ломает значение', async () => {
    const user = userEvent.setup();
    render(<Harness initial="#30a46c" />);
    await user.click(screen.getByRole('button', { name: 'Цвет' }));
    const hex = await screen.findByRole('textbox', { name: 'HEX-код цвета' });
    await user.clear(hex);
    await user.type(hex, 'C8460A');
    expect(screen.getByTestId('value')).toHaveTextContent('#c8460a');
    await user.clear(hex);
    await user.type(hex, '#zz');
    expect(screen.getByRole('alert')).toHaveTextContent('Формат');
    expect(hex).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('value')).toHaveTextContent('#c8460a');
  });

  it('«Без цвета» сбрасывает значение и закрывает панель', async () => {
    const user = userEvent.setup();
    render(<Harness initial="#30a46c" />);
    await user.click(screen.getByRole('button', { name: 'Цвет' }));
    await user.click(await screen.findByRole('button', { name: 'Без цвета' }));
    expect(screen.getByTestId('value')).toHaveTextContent('null');
    await waitFor(() => expect(screen.queryByTestId('color-panel')).toBeNull());
    expect(screen.getByRole('button', { name: 'Цвет' })).toHaveTextContent('Выберите цвет');
  });

  it('закрывается по Escape и по клику снаружи', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Цвет' });
    await user.click(trigger);
    await screen.findByTestId('color-panel');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByTestId('color-panel')).toBeNull());
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);
    await screen.findByTestId('color-panel');
    await user.click(screen.getByRole('button', { name: 'Снаружи' }));
    await waitFor(() => expect(screen.queryByTestId('color-panel')).toBeNull());
  });

  it('встроенная палитра: оттенок меняет цвет без системного окна', async () => {
    const user = userEvent.setup();
    render(<Harness initial="#ff0000" />);
    await user.click(screen.getByRole('button', { name: 'Цвет' }));
    await user.click(await screen.findByRole('button', { name: 'Свой цвет: палитра' }));
    const hue = screen.getByRole('slider', { name: 'Оттенок' });
    expect(screen.getByRole('slider', { name: 'Насыщенность и яркость' })).toBeInTheDocument();
    expect(document.querySelector('input[type="color"]')).toBeNull();
    await user.click(hue);
    // jsdom не двигает range мышью — задаём значение напрямую через нативный сеттер.
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(hue, '120');
    hue.dispatchEvent(new Event('input', { bubbles: true }));
    await waitFor(() => expect(screen.getByTestId('value')).toHaveTextContent('#00ff00'));
  });

  it('HSV ↔ HEX преобразования обратимы', () => {
    for (const hex of ['#000000', '#ffffff', '#f26a1b', '#30a46c', '#3e63dd']) {
      expect(hsvToHex(hexToHsv(hex))).toBe(hex);
    }
  });

  it('внутри модального Dialog: открывается, виден, в портале над диалогом, без clipping', async () => {
    const user = userEvent.setup();
    function DialogHarness() {
      const [value, setValue] = useState<string | null>('#f26a1b');
      return (
        <Dialog open>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Новая роль</DialogTitle>
            </DialogHeader>
            <DialogBody className="overflow-hidden">
              <ColorPicker aria-label="Цвет" value={value} onChange={setValue} />
              <output data-testid="value">{value ?? 'null'}</output>
            </DialogBody>
          </DialogContent>
        </Dialog>
      );
    }
    render(<DialogHarness />);
    const dialog = screen.getByRole('dialog', { name: 'Новая роль' });
    const trigger = within(dialog).getByRole('button', { name: 'Цвет' });
    await user.click(trigger);

    const panel = await screen.findByTestId('color-panel');
    expect(panel).toBeInTheDocument();
    expect(panel).toBeVisible();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    // Портал: панель не внутри DOM диалога (overflow диалога её не режет) …
    expect(dialog.contains(panel)).toBe(false);
    // … и z-index popover выше модалки (z-50): класс из шкалы tailwind.
    const content = panel.parentElement as HTMLElement;
    expect(content.className).toMatch(/(^|\s)z-popover(\s|$)/);
    expect(document.querySelector('input[type="color"]')).toBeNull();

    // Взаимодействие внутри панели не закрывает диалог и меняет значение.
    await user.click(within(panel).getByRole('button', { name: 'Зелёный' }));
    expect(screen.getByTestId('value')).toHaveTextContent('#30a46c');
    expect(screen.getByRole('dialog', { name: 'Новая роль' })).toBeInTheDocument();

    // Escape закрывает только picker, диалог остаётся.
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByTestId('color-panel')).toBeNull());
    expect(screen.getByRole('dialog', { name: 'Новая роль' })).toBeInTheDocument();
  });
});
