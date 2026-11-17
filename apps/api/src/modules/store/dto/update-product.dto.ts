import { CurrencyType } from '@prisma/client';
import {
  IsProductImageUrl,
  NormalizeProductImageUrl,
} from '../product-image-url';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

/// Вариантов (цен) здесь нет — они управляются отдельными эндпоинтами
/// /admin/store/products/:id/variants, как и в API-REFERENCE.
export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @IsOptional()
  @IsString()
  @Length(0, 5000)
  fullDescription?: string;

  @IsOptional()
  @NormalizeProductImageUrl()
  @IsProductImageUrl()
  image?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @NormalizeProductImageUrl()
  @IsProductImageUrl({ each: true })
  images?: string[];

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  positionId?: string;

  @IsOptional()
  @IsBoolean()
  isGiftable?: boolean;

  @IsOptional()
  @IsBoolean()
  isSelfOnly?: boolean;

  @IsOptional()
  @IsBoolean()
  isUnique?: boolean;

  @IsOptional()
  @IsBoolean()
  isSeasonalOnly?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxPerPurchase?: number;

  @IsOptional()
  @IsEnum(CurrencyType)
  currencyType?: CurrencyType;

  @IsOptional()
  @IsInt()
  @Min(1)
  currencyAmount?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  // gameCommands в DTO НЕТ намеренно: шаблоны команд выдачи редактируются
  // только в 0.11 (ADR-0184 Р1); существующие значения в БД не трогаются.

  @IsOptional()
  @IsString()
  @Length(0, 100)
  server?: string;
}
