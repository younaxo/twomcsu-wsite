import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ListReportsQueryDto } from './list-reports-query.dto';
import { REPORT_PRIORITIES, ReportPriority } from '../report-priority.provider';

/// Очередь персонала: к фильтрам игрока (status/type) добавляются
/// `priority`, `assignedToId` и поиск `q`.
export class StaffListReportsQueryDto extends ListReportsQueryDto {
  /// Вычисляемый приоритет (в БД не хранится) — отображается в набор типов.
  @IsOptional()
  @IsEnum(REPORT_PRIORITIES)
  priority?: ReportPriority;

  /// `me` — назначенные на текущего сотрудника, `unassigned` — без
  /// исполнителя, иначе id пользователя.
  @IsOptional()
  @IsString()
  @MaxLength(64)
  assignedToId?: string;

  /// Поиск (без учёта регистра): номер обращения, описание, ник цели, ник
  /// автора.
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(100)
  q?: string;
}
