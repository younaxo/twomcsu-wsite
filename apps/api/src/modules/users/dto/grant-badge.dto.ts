import { UserBadgeType } from '@prisma/client';
import { IsEnum, IsISO8601, IsOptional } from 'class-validator';

export class GrantBadgeDto {
  @IsEnum(UserBadgeType)
  type!: UserBadgeType;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
