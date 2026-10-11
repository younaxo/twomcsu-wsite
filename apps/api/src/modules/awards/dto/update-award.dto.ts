import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class UpdateAwardDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  /// null очищает описание.
  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  iconUrl?: string;

  /// Цвет рамки — только #RRGGBB (ADR-0139); null очищает.
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'Цвет — в формате #RRGGBB' })
  color?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^(common|rare|epic|legendary)$/)
  rarity?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
