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
  Matches,
  Min,
} from 'class-validator';
import { IsDecimalInput } from './decimal-input';

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

  /// Decimal-строка; для PERCENT — 0 < значение <= 100 (проверяет сервис).
  @IsDecimalInput()
  discountValue!: string;

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
}
