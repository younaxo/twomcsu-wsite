import {
  IsBoolean,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class UpdatePunishmentDto {
  @IsOptional()
  @IsString()
  @Length(1, 1000)
  reason?: string;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isAppealable?: boolean;
}
