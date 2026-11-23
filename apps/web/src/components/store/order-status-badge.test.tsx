import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OrderStatusBadge } from '@/components/store/order-status-badge';

describe('OrderStatusBadge', () => {
  it('REFUND_PENDING: подпись про обработку возврата', () => {
    render(<OrderStatusBadge status="REFUND_PENDING" />);
    expect(screen.getByText('Возврат обрабатывается')).toBeTruthy();
  });

  it('REFUND_FAILED: подпись про неудавшийся возврат', () => {
    render(<OrderStatusBadge status="REFUND_FAILED" />);
    expect(screen.getByText('Возврат не удался')).toBeTruthy();
  });

  it('прежние статусы без изменений', () => {
    render(<OrderStatusBadge status="REFUNDED" />);
    expect(screen.getByText('Возвращён')).toBeTruthy();
  });

  it('неизвестный статус не падает и показывает запасную подпись', () => {
    render(<OrderStatusBadge status="SOMETHING_NEW" />);
    expect(screen.getByText('Статус уточняется')).toBeTruthy();
  });

  it('служебные ключи прототипа не считаются статусами', () => {
    render(<OrderStatusBadge status="constructor" />);
    expect(screen.getByText('Статус уточняется')).toBeTruthy();
  });
});
