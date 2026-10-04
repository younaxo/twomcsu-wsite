import { IsOptional, IsString, Length } from 'class-validator';

export class HardDeleteDto {
  @IsOptional()
  @IsString()
  @Length(0, 1000)
  reason?: string;
}
