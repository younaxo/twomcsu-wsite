import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Tooltip, TooltipProvider } from './tooltip';

describe('Tooltip', () => {
  it('открывается по фокусу с клавиатуры и закрывается по Escape', async () => {
    render(
      <TooltipProvider delayDuration={0}>
        <Tooltip content="Удалить роль">
          <button type="button">Удалить</button>
        </Tooltip>
      </TooltipProvider>,
    );
    const user = userEvent.setup();
    await user.tab();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Удалить роль');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('shortcut рендерит клавиши рядом с текстом', async () => {
    render(
      <TooltipProvider delayDuration={0}>
        <Tooltip content="Поиск" shortcut={['Ctrl', 'K']}>
          <button type="button">Найти</button>
        </Tooltip>
      </TooltipProvider>,
    );
    await userEvent.setup().tab();
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('Поиск');
    expect(tooltip.querySelectorAll('kbd')).toHaveLength(2);
  });

  it('не использует нативный title', () => {
    render(
      <TooltipProvider>
        <Tooltip content="Подсказка">
          <button type="button">Кнопка</button>
        </Tooltip>
      </TooltipProvider>,
    );
    expect(screen.getByRole('button', { name: 'Кнопка' })).not.toHaveAttribute('title');
  });
});
