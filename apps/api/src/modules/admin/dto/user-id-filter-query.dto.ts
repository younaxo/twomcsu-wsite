import { IsOptional, IsString } from 'class-validator';

export class UserIdFilterQueryDto {
  @IsOptional()
  @IsString()
  userId?: string;
}
