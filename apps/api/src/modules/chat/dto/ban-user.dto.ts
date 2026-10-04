import { IsISO8601, IsOptional, IsString, Length } from 'class-validator';

export class BanUserDto {
  @IsString()
  userId!: string;

  @IsString()
  @Length(1, 500)
  reason!: string;

  @IsOptional()
  @IsISO8601()
  bannedUntil?: string;
}
