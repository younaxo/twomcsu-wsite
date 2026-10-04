import { ReportStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class ChangeReportStatusDto {
  @IsEnum(ReportStatus)
  status!: ReportStatus;
}
