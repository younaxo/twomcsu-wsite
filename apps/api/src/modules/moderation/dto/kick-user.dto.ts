import { IsOptional, IsString, Length } from 'class-validator';

export class KickUserDto {
  @IsOptional()
  @IsString()
  @Length(0, 1000)
  reason?: string;
}
