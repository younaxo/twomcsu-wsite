import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';
import {
  IsProductImageUrl,
  NormalizeProductImageUrl,
} from '../product-image-url';

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @IsOptional()
  @NormalizeProductImageUrl()
  @IsProductImageUrl()
  icon?: string;

  @IsOptional()
  @NormalizeProductImageUrl()
  @IsProductImageUrl()
  image?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  parentId?: string;
}
