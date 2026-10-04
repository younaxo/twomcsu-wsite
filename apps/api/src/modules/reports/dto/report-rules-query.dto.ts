import { ReportType } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class ReportRulesQueryDto {
  @IsOptional()
  @IsEnum(ReportType)
  type?: ReportType;
}
