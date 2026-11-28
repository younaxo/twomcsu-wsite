import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/// Ручная отметка «выдано»: причина обязательна.
export class MarkManualDoneDto {
  @Transform(trim)
  @IsString()
  @Length(1, 1000)
  reason!: string;
}

/// Повтор выдачи: явное подтверждение обязательно («команда могла уже
/// выполниться»); причина необязательна.
export class RetryDeliveryTaskDto {
  @IsBoolean()
  confirmed!: boolean;

  /// R167: для задания Bridge с неизвестным исходом (UNKNOWN/CLAIMED) —
  /// «проверил на сервере, выдачи не было»; тогда же причина обязательна.
  @IsOptional()
  @IsBoolean()
  serverChecked?: boolean;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

/// Перевод задания команды в ручную выдачу; причина необязательна.
export class MoveToManualDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
