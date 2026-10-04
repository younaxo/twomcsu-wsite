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
  @IsString()
  image?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
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
