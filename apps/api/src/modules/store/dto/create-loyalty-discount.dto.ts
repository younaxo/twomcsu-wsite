import { IsInt, IsOptional, IsString, Length, Min } from 'class-validator';
import { IsDecimalInput } from './decimal-input';

export class CreateLoyaltyDiscountDto {
  @IsInt()
  @Min(1)
  minPurchases!: number;

  /// Decimal-строка процента, 0 < значение <= 100 (проверяет сервис).
  @IsDecimalInput()
  discountPercent!: string;

  @IsString()
  @Length(1, 100)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;
}
