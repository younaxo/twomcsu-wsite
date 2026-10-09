import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/// Данные Telegram Login Widget — все поля участвуют в проверке подписи,
/// поэтому принимаются как есть (без лишних преобразований).
export class TelegramAuthPayloadDto {
  @IsInt()
  id!: number;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  first_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  last_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  photo_url?: string;

  @IsInt()
  auth_date!: number;

  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  hash!: string;
}

export class TelegramAuthDto {
  @ValidateNested()
  @Type(() => TelegramAuthPayloadDto)
  payload!: TelegramAuthPayloadDto;
}
