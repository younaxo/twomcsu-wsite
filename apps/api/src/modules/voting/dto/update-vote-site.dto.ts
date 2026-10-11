import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Min,
} from 'class-validator';

export class UpdateVoteSiteDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  url?: string;

  /// null убирает логотип (ADR-0144).
  @IsOptional()
  @IsString()
  @Length(0, 500)
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  logoUrl?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  rewardCoins?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  cooldownHours?: number;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
