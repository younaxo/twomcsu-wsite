import { IsISO8601, IsOptional, IsString, Length } from 'class-validator';

export class BanReportsDto {
  @IsString()
  @Length(1, 1000)
  reason!: string;

  /// Отсутствует => бессрочный бан в тикет-системе.
  @IsOptional()
  @IsISO8601()
  bannedUntil?: string;
}
