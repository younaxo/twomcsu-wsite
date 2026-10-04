import { IsInt, IsOptional, IsISO8601, Min } from 'class-validator';

export class CreateInviteDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
