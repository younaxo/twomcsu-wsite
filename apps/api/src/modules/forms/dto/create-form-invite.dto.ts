import { IsInt, IsISO8601, IsOptional, Min } from 'class-validator';

export class CreateFormInviteDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
