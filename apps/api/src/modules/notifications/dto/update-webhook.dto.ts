import { NotificationType } from '@prisma/client';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  Length,
} from 'class-validator';

export class UpdateWebhookDto {
  @IsOptional()
  @IsString()
  @Length(1, 80)
  name?: string;

  @IsOptional()
  @IsString()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  url?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(NotificationType, { each: true })
  eventTypes?: NotificationType[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
