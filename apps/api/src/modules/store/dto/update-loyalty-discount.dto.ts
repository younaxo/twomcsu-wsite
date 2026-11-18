import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';
import { IsDecimalInput } from './decimal-input';

export class UpdateLoyaltyDiscountDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  minPurchases?: number;

  @IsOptional()
  @IsDecimalInput()
  discountPercent?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
