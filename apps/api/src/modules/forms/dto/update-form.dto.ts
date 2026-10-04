import { FormVisibility } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import { FormFieldDto } from './form-field.dto';

/// Статус формы (publish/close) не меняется здесь — только через
/// отдельные admin/forms/:id/publish|close, чтобы не дублировать их
/// семантику (проверка наличия полей и т.п.) внутри общего PATCH.
export class UpdateFormDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  description?: string;

  @IsOptional()
  @IsString()
  coverImage?: string;

  @IsOptional()
  @IsEnum(FormVisibility)
  visibility?: FormVisibility;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxResponses?: number;

  @IsOptional()
  @IsBoolean()
  onePerUser?: boolean;

  @IsOptional()
  @IsBoolean()
  isAnonymous?: boolean;

  @IsOptional()
  @IsBoolean()
  showResults?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresAuth?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresCaptcha?: boolean;

  @IsOptional()
  @IsISO8601()
  opensAt?: string;

  @IsOptional()
  @IsISO8601()
  closesAt?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  timeLimit?: number;

  @IsOptional()
  @IsBoolean()
  multiStep?: boolean;

  @IsOptional()
  @IsString()
  @Length(0, 20_000)
  customCss?: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  thankYouMessage?: string;

  @IsOptional()
  @IsString()
  @IsUrl({ require_protocol: false })
  redirectUrl?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => FormFieldDto)
  fields?: FormFieldDto[];
}
