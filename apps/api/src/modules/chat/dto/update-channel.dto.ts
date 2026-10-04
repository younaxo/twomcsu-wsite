import { ChatChannelType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

export class UpdateChannelDto {
  @IsOptional()
  @IsString()
  @Length(1, 80)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @IsOptional()
  @IsEnum(ChatChannelType)
  type?: ChatChannelType;

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

  @IsOptional()
  @IsString()
  minRoleGroup?: string;
}
