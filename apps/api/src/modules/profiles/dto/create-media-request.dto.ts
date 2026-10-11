import { MediaGroup } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUrl, Length } from 'class-validator';

export class CreateMediaRequestDto {
  @IsEnum(MediaGroup)
  mediaGroup!: MediaGroup;

  /// Только http/https (ADR-0141); без протокола — допишется https://.
  @IsString()
  @Length(1, 500)
  @IsUrl({ require_protocol: false, protocols: ['http', 'https'] })
  channelUrl!: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  description?: string;
}
