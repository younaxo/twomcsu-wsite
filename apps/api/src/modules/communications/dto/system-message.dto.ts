import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/// Лимиты — зеркало `SYSTEM_MESSAGE_LIMITS` из shared (api не импортирует shared).
export const SYSTEM_MESSAGE_TITLE_MAX = 120;
export const SYSTEM_MESSAGE_TEXT_MAX = 2000;
export const SYSTEM_MESSAGE_USERS_MAX = 100;

/// Ссылка: внутренний путь `/…` (не `//`) или `https://…`.
const LINK_PATTERN = /^(\/(?!\/)\S*|https:\/\/\S+)$/;

export class SystemMessageContentDto {
  @IsString()
  @Length(1, SYSTEM_MESSAGE_TITLE_MAX)
  title!: string;

  @IsString()
  @Length(1, SYSTEM_MESSAGE_TEXT_MAX)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(LINK_PATTERN, {
    message: 'Ссылка — внутренний путь /… или https://…',
  })
  link?: string | null;
}

export class SendSystemMessageDto extends SystemMessageContentDto {
  @IsString()
  @Length(1, 64)
  userId!: string;
}

export class SystemMessageAudienceDto {
  @IsIn(['all', 'role', 'users'])
  kind!: 'all' | 'role' | 'users';

  @IsOptional()
  @IsString()
  @Length(1, 64)
  roleId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(SYSTEM_MESSAGE_USERS_MAX)
  @ArrayUnique()
  @IsString({ each: true })
  userIds?: string[];
}

export class BulkSystemMessagePreviewDto {
  @ValidateNested()
  @Type(() => SystemMessageAudienceDto)
  audience!: SystemMessageAudienceDto;
}

export class BulkSystemMessageDto extends SystemMessageContentDto {
  @ValidateNested()
  @Type(() => SystemMessageAudienceDto)
  audience!: SystemMessageAudienceDto;

  @IsInt()
  @Min(1)
  confirmCount!: number;
}

export class RecipientsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  q?: string;
}
