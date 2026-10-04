import { FormFieldType } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

export class FormFieldDto {
  @IsEnum(FormFieldType)
  type!: FormFieldType;

  @IsString()
  @Length(1, 200)
  label!: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  description?: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  placeholder?: string;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  stepIndex?: number;

  /// Варианты для RADIO/CHECKBOX/SELECT — проверяются сервисом (поле
  /// требует непустой options), не декоратором, т.к. зависят от `type`.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  options?: string[];

  @IsOptional()
  @IsObject()
  validation?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  conditionalLogic?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  defaultValue?: string;

  @IsOptional()
  @IsInt()
  minValue?: number;

  @IsOptional()
  @IsInt()
  maxValue?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  minLength?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxLength?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxFiles?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxFileSize?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedMimes?: string[];
}
