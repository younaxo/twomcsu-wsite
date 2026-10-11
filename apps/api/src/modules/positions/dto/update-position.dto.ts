import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class UpdatePositionDto {
  @IsOptional()
  @IsString()
  @Length(2, 64)
  displayName?: string;

  @IsOptional()
  @IsString()
  @Length(1, 32)
  group?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  color?: string;

  /// null очищает (ADR-0140).
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{8}$/)
  backgroundColor?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  icon?: string | null;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  isVisible?: boolean;
}
