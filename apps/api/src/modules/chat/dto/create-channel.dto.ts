import { ChatChannelType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
} from 'class-validator';

export class CreateChannelDto {
  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message:
      'slug может содержать только строчные латинские буквы, цифры и дефис',
  })
  @Length(1, 48)
  slug!: string;

  @IsString()
  @Length(1, 80)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @IsEnum(ChatChannelType)
  type!: ChatChannelType;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isReadOnly?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  slowMode?: number;

  @IsOptional()
  @IsInt()
  order?: number;

  /// Permission key (не роль), минимально нужный для отправки в read-only
  /// канал — см. комментарий у ChatChannel.minRoleGroup в schema.prisma.
  @IsOptional()
  @IsString()
  minRoleGroup?: string;
}
