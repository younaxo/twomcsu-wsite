import { ProductDuration } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { IsPriceString } from './price-string';

export class CreateVariantDto {
  @IsEnum(ProductDuration)
  duration!: ProductDuration;

  /// Decimal-строка ("199.00"), не число.
  @IsPriceString()
  price!: string;

  @IsOptional()
  @IsPriceString()
  oldPrice?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}
