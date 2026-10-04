import { ChatMuteReason } from '@prisma/client';
import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class MuteUserDto {
  @IsString()
  userId!: string;

  @IsOptional()
  @IsString()
  channelId?: string;

  @IsEnum(ChatMuteReason)
  reason!: ChatMuteReason;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  reasonNote?: string;

  @IsOptional()
  @IsISO8601()
  mutedUntil?: string;
}
