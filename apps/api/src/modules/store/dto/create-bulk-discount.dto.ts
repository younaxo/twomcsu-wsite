import { DiscountType, ProductType } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { IsDecimalInput } from './decimal-input';

export class CreateBulkDiscountDto {
  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsEnum(ProductType)
  productType?: ProductType;

  @IsOptional()
  @IsInt()
  @Min(0)
  minQuantity?: number;

  @IsOptional()
  @IsDecimalInput()
  minAmount?: string;

  @IsEnum(DiscountType)
  discountType!: DiscountType;

  /// Decimal-строка; для PERCENT — 0 < значение <= 100 (проверяет сервис).
  @IsDecimalInput()
  discountValue!: string;
}
