import {
  IsBoolean,
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class ScheduledExportDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  /// Идентификатор страницы/списка, который экспортируется (`users`, `orders`...).
  @IsString()
  @MaxLength(100)
  page!: string;

  @IsString()
  @MaxLength(20)
  format!: string;

  @IsOptional()
  @IsObject()
  filters?: Record<string, unknown>;

  /// Cron-выражение расписания. Фактическое выполнение по расписанию —
  /// PHASE 29 (нет cron-инфраструктуры); здесь только CRUD-хранение.
  @IsString()
  @MaxLength(100)
  schedule!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
