import { CurrencyType, ProductType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  IsProductImageUrl,
  NormalizeProductImageUrl,
} from '../product-image-url';
import { CreateVariantDto } from './create-variant.dto';

export class CreateProductDto {
  @IsString()
  @Length(1, 200)
  name!: string;

  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message:
      'slug может содержать только строчные латинские буквы, цифры и дефис',
  })
  @Length(1, 160)
  slug!: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @IsOptional()
  @IsString()
  @Length(0, 5000)
  fullDescription?: string;

  @IsEnum(ProductType)
  type!: ProductType;

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

  @IsString()
  categoryId!: string;

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
  isFeatured?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  // isActive и gameCommands в DTO НЕТ намеренно: новый товар всегда создаётся
  // неактивным (ADR-0185 п. 6, активация — отдельным PATCH), а шаблоны команд
  // выдачи редактируются только в 0.11 (ADR-0184 Р1). Поле в теле запроса —
  // 400 «property … should not exist» (forbidNonWhitelisted).

  @IsOptional()
  @IsString()
  @Length(0, 100)
  server?: string;

  @IsOptional()
  @IsString()
  decorationId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  variants!: CreateVariantDto[];
}
