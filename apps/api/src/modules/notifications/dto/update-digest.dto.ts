import { DigestMode } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';

export class UpdateDigestDto {
  @IsEnum(DigestMode)
  digestMode!: DigestMode;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'digestTime должен быть в формате HH:mm',
  })
  digestTime?: string;
}
