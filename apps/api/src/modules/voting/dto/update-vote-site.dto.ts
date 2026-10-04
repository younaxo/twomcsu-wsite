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
  @IsUrl({ require_protocol: true })
  url?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

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
