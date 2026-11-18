import { DiscountType } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { IsDecimalInput } from './decimal-input';

export class UpdateBulkDiscountDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  minQuantity?: number;

  @IsOptional()
  @IsDecimalInput()
  minAmount?: string;

  @IsOptional()
  @IsEnum(DiscountType)
  discountType?: DiscountType;

  @IsOptional()
  @IsDecimalInput()
  discountValue?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
