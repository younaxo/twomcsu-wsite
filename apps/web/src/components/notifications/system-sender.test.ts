import type { NotificationDto } from '@twomc/shared';
import { describe, expect, it } from 'vitest';
import { isSystemMessage } from './system-sender';

type Item = Pick<NotificationDto, 'type' | 'link'>;

describe('isSystemMessage', () => {
  it('SYSTEM — всегда от имени сайта (ADR-0080)', () => {
    expect(isSystemMessage({ type: 'SYSTEM', link: null })).toBe(true);
    expect(isSystemMessage({ type: 'SYSTEM', link: '/admin/x' })).toBe(true);
  });

  it.each(['REPORT_STATUS_CHANGED', 'REPORT_VERDICT', 'SYSTEM'])(
    '%s со ссылкой /support/ — «Система» (Q51)',
    (type) => {
      expect(isSystemMessage({ type, link: '/support/123' })).toBe(true);
    },
  );

  it.each<Item>([
    { type: 'REPORT_STATUS_CHANGED', link: '/admin/reports/1' },
    { type: 'REPORT_VERDICT', link: null },
    { type: 'REPORT_ASSIGNED', link: '/support/123' },
    { type: 'FRIEND_REQUEST', link: '/support/123' },
    { type: 'REPORT_STATUS_CHANGED', link: '/supportive/1' },
  ])('не затрагивает $type со ссылкой $link', (item) => {
    expect(isSystemMessage(item)).toBe(false);
  });
});
