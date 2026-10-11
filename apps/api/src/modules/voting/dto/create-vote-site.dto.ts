import {
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  Min,
} from 'class-validator';

export class CreateVoteSiteDto {
  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message:
      'slug может содержать только строчные латинские буквы, цифры и дефис',
  })
  @Length(1, 80)
  slug!: string;

  @IsString()
  @Length(1, 120)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  /// Только http/https (ADR-0144): ссылка «Голосовать» на сайте.
  @IsString()
  @Length(1, 500)
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  url!: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  @IsUrl({ require_protocol: true, protocols: ['https'] })
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
}
