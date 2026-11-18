import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { MAX_REPORT_PAGE } from '../report-constants';
import { ListReportsQueryDto } from './list-reports-query.dto';
import { ReportHistoryQueryDto } from './report-history-query.dto';
import { StaffListReportsQueryDto } from './staff-list-reports-query.dto';

const classes = [
  ReportHistoryQueryDto,
  ListReportsQueryDto,
  StaffListReportsQueryDto,
] as const;

describe.each(classes)('%p: верхняя граница page', (cls) => {
  const errorsFor = (page: string) =>
    validateSync(plainToInstance(cls, { page })).filter(
      (e) => e.property === 'page',
    );

  it('MAX_REPORT_PAGE допустим', () => {
    expect(errorsFor(String(MAX_REPORT_PAGE))).toHaveLength(0);
  });

  it('больше MAX_REPORT_PAGE — ошибка валидации', () => {
    expect(errorsFor(String(MAX_REPORT_PAGE + 1))).toHaveLength(1);
    expect(errorsFor('999999999')).toHaveLength(1);
  });

  it('0 — ошибка валидации', () => {
    expect(errorsFor('0')).toHaveLength(1);
  });
});
