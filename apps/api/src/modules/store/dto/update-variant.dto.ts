import { IsBoolean, IsNumber, IsOptional, Min } from 'class-validator';

export class UpdateVariantDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  oldPrice?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
