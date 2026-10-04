import { IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

export class MuteUserDto {
  @IsString()
  @Length(1, 1000)
  reason!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number;
}
