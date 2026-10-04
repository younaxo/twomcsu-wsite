import { ProductDuration } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, Min } from 'class-validator';

export class CreateVariantDto {
  @IsEnum(ProductDuration)
  duration!: ProductDuration;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  oldPrice?: number;
}
