import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog';

function Example() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button">Новая роль</button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Создать роль</DialogTitle>
          <DialogDescription>Название, slug и приоритет.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <input aria-label="Название" />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

describe('Dialog', () => {
  it('открывается по триггеру, имеет заголовок и кнопку закрытия, закрывается по Escape', async () => {
    render(<Example />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Новая роль' }));
    const dialog = await screen.findByRole('dialog', { name: 'Создать роль' });
    expect(dialog).toHaveAccessibleDescription('Название, slug и приоритет.');
    expect(screen.getByRole('button', { name: 'Закрыть' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('кнопка «Закрыть» закрывает окно и возвращает фокус триггеру', async () => {
    render(<Example />);
    const user = userEvent.setup();
    const trigger = screen.getByRole('button', { name: 'Новая роль' });
    await user.click(trigger);
    await user.click(await screen.findByRole('button', { name: 'Закрыть' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger).toHaveFocus();
  });
});
