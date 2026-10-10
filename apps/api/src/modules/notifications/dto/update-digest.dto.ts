import { DigestMode } from '@prisma/client';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

export class UpdateDigestDto {
  /// Сводка по расписанию (HOURLY/DAILY/WEEKLY) требует фоновых задач — их пока
  /// нет, и такой режим молча оставил бы игрока без писем (ADR-0110). Пока —
  /// только INSTANT; ручная сводка — `POST /notifications/digest/test`.
  @IsIn([DigestMode.INSTANT], {
    message: 'Сводка по расписанию пока недоступна — письма приходят сразу',
  })
  digestMode!: DigestMode;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'digestTime должен быть в формате HH:mm',
  })
  digestTime?: string;
}
