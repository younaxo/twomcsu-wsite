import { StreamPlatform } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  Length,
} from 'class-validator';

export class CreateStreamChannelDto {
  @IsEnum(StreamPlatform)
  platform!: StreamPlatform;

  @IsString()
  @Length(1, 100)
  channelKey!: string;

  @IsString()
  @IsUrl({ require_protocol: true })
  channelUrl!: string;

  @IsString()
  @Length(1, 120)
  displayName!: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsBoolean()
  isPartner?: boolean;
}
