import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge, StatusBadge } from './badge';

describe('Badge / StatusBadge', () => {
  it('StatusBadge передаёт статус иконкой и текстом, не только цветом', () => {
    const { container } = render(<StatusBadge status="blocked" />);
    expect(screen.getByText('Заблокирован')).toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('StatusBadge принимает свою подпись', () => {
    render(<StatusBadge status="online">В сети</StatusBadge>);
    expect(screen.getByText('В сети')).toBeInTheDocument();
  });

  it('цвет роли задаётся inline из данных API, без hex в коде компонента', () => {
    render(<Badge color="#1C8A56">Старший модератор</Badge>);
    const badge = screen.getByText('Старший модератор');
    expect(badge.style.color).toBe('rgb(28, 138, 86)');
    expect(badge.style.borderColor).toBe('rgb(28, 138, 86)');
  });
});
