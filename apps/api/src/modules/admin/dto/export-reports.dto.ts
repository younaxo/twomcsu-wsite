import { ReportStatus, ReportType } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';

export class ExportReportsDto {
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  @IsOptional()
  @IsEnum(ReportType)
  type?: ReportType;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
