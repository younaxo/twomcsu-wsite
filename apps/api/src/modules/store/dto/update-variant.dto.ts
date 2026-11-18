import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';
import { IsPriceString } from './price-string';

export class UpdateVariantDto {
  /// Decimal-строка ("199.00"), не число.
  @IsOptional()
  @IsPriceString()
  price?: string;

  @IsOptional()
  @IsPriceString()
  oldPrice?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}
