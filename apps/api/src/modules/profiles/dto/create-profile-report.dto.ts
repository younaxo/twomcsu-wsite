import { ProfileReportReason } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Length } from 'class-validator';

export class CreateProfileReportDto {
  @IsEnum(ProfileReportReason)
  reason!: ProfileReportReason;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  description?: string;
}
