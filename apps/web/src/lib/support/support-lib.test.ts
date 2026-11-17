import { describe, expect, it } from 'vitest';
import {
  EMPTY_STAFF_FILTER,
  buildStaffReportsQuery,
  formatHistoryChanges,
} from '@/lib/admin/reports';
import { ApiError } from '@/lib/api/errors';
import { describeSupportError } from './errors';
import {
  REPORT_TYPES,
  historyItemTitle,
  parseStatusFilter,
  parseTypeFilter,
  replyBlockReason,
} from './hooks';

describe('lib/support', () => {
  it('все 6 типов обращений описаны; цели нужны только жалобам', () => {
    expect(Object.keys(REPORT_TYPES)).toHaveLength(6);
    const withTargets = Object.entries(REPORT_TYPES)
      .filter(([, meta]) => meta.needsTarget)
      .map(([type]) => type);
    expect(withTargets).toEqual(['PLAYER_COMPLAINT', 'ADMIN_COMPLAINT']);
    expect(REPORT_TYPES.DONATION_PROBLEM.kind).toBe('donation');
    expect(REPORT_TYPES.PUNISHMENT_APPEAL.kind).toBe('appeal');
  });

  it('replyBlockReason: итоговые статусы и блокировка, иначе null', () => {
    expect(replyBlockReason({ status: 'PENDING', isLocked: false })).toBeNull();
    expect(replyBlockReason({ status: 'WAITING_RESPONSE', isLocked: false })).toBeNull();
    for (const status of ['RESOLVED', 'REJECTED', 'CLOSED'] as const) {
      expect(replyBlockReason({ status, isLocked: false })).toMatch(/закрыто/);
    }
    expect(replyBlockReason({ status: 'PENDING', isLocked: true, lockedReason: 'Спам' })).toMatch(
      /Спам/,
    );
  });

  it('describeSupportError: 400/403/404/409 — понятные тексты; свой текст сервера приоритетнее', () => {
    expect(describeSupportError(new ApiError(403, ['Недостаточно прав']))).toMatch(/закрыто/);
    expect(describeSupportError(new ApiError(404, ['Не найдено']))).toMatch(/не существуют/);
    expect(describeSupportError(new ApiError(409, ['Конфликт данных']))).toMatch(/открытое/);
    expect(describeSupportError(new ApiError(400, ['Некорректный запрос']))).toMatch(/Проверьте/);
    expect(describeSupportError(new ApiError(400, ['Укажите ник нарушителя']))).toBe(
      'Укажите ник нарушителя',
    );
    expect(describeSupportError(new Error('boom'))).toBe('boom');
  });
});

describe('lib/admin/reports', () => {
  it('buildStaffReportsQuery: пустые фильтры не попадают в запрос', () => {
    expect(buildStaffReportsQuery(EMPTY_STAFF_FILTER)).toEqual({ page: 1, limit: 30 });
  });

  it('buildStaffReportsQuery: все фильтры, q обрезается до 100 символов', () => {
    const query = buildStaffReportsQuery({
      status: 'PENDING',
      type: 'DONATION_PROBLEM',
      priority: 'URGENT',
      assignedToId: ' me ',
      q: ` ${'x'.repeat(150)} `,
      page: 2,
    });
    expect(query).toMatchObject({
      page: 2,
      status: 'PENDING',
      type: 'DONATION_PROBLEM',
      priority: 'URGENT',
      assignedToId: 'me',
    });
    expect(query.q).toHaveLength(100);
  });

  it('formatHistoryChanges: только текст, пусто для null, усечение длинных значений', () => {
    expect(formatHistoryChanges(null)).toBe('');
    expect(formatHistoryChanges({})).toBe('');
    expect(formatHistoryChanges({ status: 'RESOLVED', n: 1 })).toBe('status: RESOLVED\nn: 1');
    expect(formatHistoryChanges({ a: 'y'.repeat(300) })).toHaveLength(
      `a: ${'y'.repeat(200)}…`.length,
    );
  });
});

describe('lib/support: история и фильтры', () => {
  it('historyItemTitle: статус в заголовке, неизвестные значения не падают', () => {
    expect(historyItemTitle({ kind: 'CREATED', status: null })).toBe('Обращение создано');
    expect(historyItemTitle({ kind: 'STATUS_CHANGED', status: 'CLOSED' })).toBe(
      'Статус изменён: Закрыто',
    );
    expect(historyItemTitle({ kind: 'WAT' as never, status: null })).toBe('Событие');
  });

  it('parseStatusFilter/parseTypeFilter: только значения enum', () => {
    expect(parseStatusFilter('RESOLVED')).toBe('RESOLVED');
    expect(parseStatusFilter('constructor')).toBeUndefined();
    expect(parseStatusFilter(null)).toBeUndefined();
    expect(parseTypeFilter('OTHER')).toBe('OTHER');
    expect(parseTypeFilter('x')).toBeUndefined();
  });
});
