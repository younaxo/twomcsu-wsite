import { CurrencyType } from '@prisma/client';
import {
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
  @IsString()
  image?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
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
  @IsArray()
  @IsString({ each: true })
  gameCommands?: string[];

  @IsOptional()
  @IsString()
  @Length(0, 100)
  server?: string;
}
