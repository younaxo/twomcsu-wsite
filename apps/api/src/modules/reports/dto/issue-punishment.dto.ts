import { PunishmentType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class IssuePunishmentDto {
  @IsEnum(PunishmentType)
  punishmentType!: PunishmentType;

  @IsString()
  @Length(1, 1000)
  reason!: string;

  @IsOptional()
  @IsString()
  @Length(0, 50)
  duration?: string;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  server?: string;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  @IsOptional()
  @IsBoolean()
  isAppealable?: boolean;
}
