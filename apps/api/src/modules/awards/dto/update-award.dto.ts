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

  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @IsOptional()
  @IsString()
  iconUrl?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(common|rare|epic|legendary)$/)
  rarity?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
