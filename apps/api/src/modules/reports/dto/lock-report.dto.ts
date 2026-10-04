import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

export class LockReportDto {
  /// По умолчанию true — тот же эндпоинт снимает блокировку при locked=false
  /// (отдельного unlock-эндпоинта спецификация не описывает).
  @IsOptional()
  @IsBoolean()
  locked?: boolean;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  reason?: string;
}
