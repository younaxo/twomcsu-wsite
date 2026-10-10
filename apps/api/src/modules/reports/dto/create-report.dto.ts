import { ReportType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';
import { ReportEvidenceLinkDto } from './report-evidence-link.dto';
import { ReportTargetDto } from './report-target.dto';

export class CreateReportDto {
  @IsEnum(ReportType)
  type!: ReportType;

  /// Нарушители — обязательны только для жалоб на игрока/администрацию
  /// (проверяет сервис, ADR-0120); у остальных типов целей может не быть.
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ReportTargetDto)
  targets!: ReportTargetDto[];

  @IsOptional()
  @IsString()
  @Length(0, 100)
  server?: string;

  @IsOptional()
  @IsISO8601()
  incidentDate?: string;

  @IsString()
  @Length(1, 5000)
  description!: string;

  @IsOptional()
  @IsString()
  @Length(0, 5000)
  additionalText?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  @Length(0, 32)
  contactPhone?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ReportEvidenceLinkDto)
  evidenceLinks?: ReportEvidenceLinkDto[];
}
