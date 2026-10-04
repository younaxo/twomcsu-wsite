import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class CreateLoyaltyDiscountDto {
  @IsInt()
  @Min(1)
  minPurchases!: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent!: number;

  @IsString()
  @Length(1, 100)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;
}
