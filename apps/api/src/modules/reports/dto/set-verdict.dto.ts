import { ReportStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Length } from 'class-validator';

export class SetVerdictDto {
  @IsString()
  @Length(1, 5000)
  verdict!: string;

  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;
}
