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

export class CreateWebhookDto {
  @IsString()
  @Length(1, 80)
  name!: string;

  @IsString()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  url!: string;

  @IsArray()
  @ArrayUnique()
  @IsEnum(NotificationType, { each: true })
  eventTypes!: NotificationType[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
