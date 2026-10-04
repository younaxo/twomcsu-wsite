import { IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

/// Ровно один из variantId/bundleId — проверяется сервисом (зависит от
/// того, что выбрано), не декоратором.
export class AddCartItemDto {
  @IsOptional()
  @IsString()
  variantId?: string;

  @IsOptional()
  @IsString()
  bundleId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsString()
  giftToUsername?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  giftMessage?: string;
}
