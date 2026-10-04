import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class BundleItemDto {
  @IsString()
  productId!: string;

  @IsOptional()
  @IsString()
  variantId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;
}
