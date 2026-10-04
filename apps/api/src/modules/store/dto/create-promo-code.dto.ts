import { DiscountType, ProductType } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
} from 'class-validator';

export class CreatePromoCodeDto {
  @IsString()
  @Matches(/^[A-Z0-9-]+$/, {
    message:
      'Код может содержать только заглавные латинские буквы, цифры и дефис',
  })
  @Length(3, 32)
  code!: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @IsEnum(DiscountType)
  discountType!: DiscountType;

  @IsNumber()
  @Min(0)
  discountValue!: number;

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
  @IsNumber()
  @Min(0)
  minOrderAmount?: number;

  @IsOptional()
  @IsBoolean()
  firstPurchaseOnly?: boolean;
}
