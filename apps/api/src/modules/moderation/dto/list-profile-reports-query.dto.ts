import { ProfileReportStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class ListProfileReportsQueryDto {
  @IsOptional()
  @IsEnum(ProfileReportStatus)
  status?: ProfileReportStatus;
}
