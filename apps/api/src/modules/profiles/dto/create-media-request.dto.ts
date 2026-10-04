import { MediaGroup } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUrl, Length } from 'class-validator';

export class CreateMediaRequestDto {
  @IsEnum(MediaGroup)
  mediaGroup!: MediaGroup;

  @IsString()
  @IsUrl({ require_protocol: false })
  channelUrl!: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  description?: string;
}
