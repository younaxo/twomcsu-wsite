import { IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

export class BanUserDto {
  @IsString()
  @Length(1, 1000)
  reason!: string;

  /// Отсутствует => перманентный бан (PERMBAN); указан => TEMPBAN.
  @IsOptional()
  @IsInt()
  @Min(1)
  durationHours?: number;
}
