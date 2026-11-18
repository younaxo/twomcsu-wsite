import { DiscountType, ProductType } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';
import { IsDecimalInput } from './decimal-input';

export class UpdatePromoCodeDto {
  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @IsOptional()
  @IsEnum(DiscountType)
  discountType?: DiscountType;

  @IsOptional()
  @IsDecimalInput()
  discountValue?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number;

  @IsOptional()
  @IsISO8601()
  validFrom?: string;

  @IsOptional()
  @IsISO8601()
  validUntil?: string;

  @IsOptional()
  @IsArray()
  @IsEnum(ProductType, { each: true })
  applicableToTypes?: ProductType[];

  @IsOptional()
  @IsDecimalInput()
  minOrderAmount?: string;

  @IsOptional()
  @IsBoolean()
  firstPurchaseOnly?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
