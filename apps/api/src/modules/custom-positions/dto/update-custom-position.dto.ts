import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class UpdateCustomPositionDto {
  @IsOptional()
  @IsString()
  @Length(2, 64)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  color?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  icon?: string | null;

  /// null очищает (ADR-0140).
  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
