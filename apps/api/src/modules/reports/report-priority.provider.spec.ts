import { ReportType } from '@prisma/client';
import {
  DefaultReportPriorityProvider,
  defaultReportPriority,
} from './report-priority.provider';

describe('DefaultReportPriorityProvider', () => {
  const provider = new DefaultReportPriorityProvider();
  const base = { status: 'PENDING' as const, authorId: 'u1' };

  it('донат-проблема, обжалование и жалоба на администрацию — HIGH', () => {
    for (const type of [
      'DONATION_PROBLEM',
      'PUNISHMENT_APPEAL',
      'ADMIN_COMPLAINT',
    ] as ReportType[]) {
      expect(provider.resolve({ ...base, type })).toBe('HIGH');
    }
  });

  it('остальные типы — NORMAL', () => {
    for (const type of [
      'PLAYER_COMPLAINT',
      'TECHNICAL_ISSUE',
      'OTHER',
    ] as ReportType[]) {
      expect(defaultReportPriority(type)).toBe('NORMAL');
    }
  });

  it('typesForPriority — обратное отображение, согласованное с resolve', () => {
    expect(provider.typesForPriority('HIGH').sort()).toEqual([
      'ADMIN_COMPLAINT',
      'DONATION_PROBLEM',
      'PUNISHMENT_APPEAL',
    ]);
    expect(provider.typesForPriority('NORMAL').sort()).toEqual([
      'OTHER',
      'PLAYER_COMPLAINT',
      'TECHNICAL_ISSUE',
    ]);
    expect(provider.typesForPriority('LOW')).toEqual([]);
    expect(provider.typesForPriority('URGENT')).toEqual([]);
  });
});
