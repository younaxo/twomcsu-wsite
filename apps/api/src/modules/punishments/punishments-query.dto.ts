import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Max,
  Min,
} from 'class-validator';
import { PunishmentOrder } from './api/punishments-api.types';

/// Query-DTO публичного, личного и служебного списков (контракт 2.1).
/// Проект использует `ValidationPipe({ whitelist, forbidNonWhitelisted,
/// transform })`: неизвестный параметр или неверное значение - 400.

export const NAME_PREFIX_RE = /^[A-Za-z0-9_.]{3,16}$/;
export const NAME_EXACT_RE = /^[A-Za-z0-9_.]{1,16}$/;
export const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
/// ISO-8601 UTC с обязательным суффиксом Z.
export const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/// Повторяющийся параметр -> массив без дубликатов; одиночное значение ->
/// массив из одного элемента; иное оставляется как есть (не пройдёт проверку).
export function toUniqueArray(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return Array.from(new Set(value as unknown[]));
  return [value];
}

/// Только строки `true` и `false`; всё прочее остаётся как есть (400).
export function toStrictBoolean(value: unknown): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

const ArrayParam = () =>
  Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) =>
    toUniqueArray(obj[key]),
  );
const BoolParam = () =>
  Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) =>
    toStrictBoolean(obj[key]),
  );

class BaseListQueryDto {
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: PunishmentOrder;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;
}

export class PublicPunishmentsQueryDto extends BaseListQueryDto {
  @IsOptional()
  @IsIn(['BAN', 'MUTE'])
  kind?: 'BAN' | 'MUTE';

  @IsOptional()
  @IsIn(['active', 'ended'])
  status?: 'active' | 'ended';

  @IsOptional()
  @IsString()
  @Matches(NAME_PREFIX_RE)
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class MyPunishmentsQueryDto extends BaseListQueryDto {
  @IsOptional()
  @ArrayParam()
  @ArrayMaxSize(4)
  @IsIn(['BAN', 'MUTE', 'WARN', 'KICK'], { each: true })
  kind?: Array<'BAN' | 'MUTE' | 'WARN' | 'KICK'>;

  @IsOptional()
  @IsIn(['active', 'ended'])
  status?: 'active' | 'ended';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class StaffPunishmentsQueryDto extends BaseListQueryDto {
  @IsOptional()
  @ArrayParam()
  @ArrayMaxSize(4)
  @IsIn(['BAN', 'MUTE', 'WARN', 'KICK'], { each: true })
  kind?: Array<'BAN' | 'MUTE' | 'WARN' | 'KICK'>;

  @IsOptional()
  @ArrayParam()
  @ArrayMaxSize(4)
  @IsIn(['ACTIVE', 'EXPIRED', 'REMOVED', 'DELETED_AT_SOURCE'], { each: true })
  status?: Array<'ACTIVE' | 'EXPIRED' | 'REMOVED' | 'DELETED_AT_SOURCE'>;

  @IsOptional()
  @IsString()
  @Matches(NAME_PREFIX_RE)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(NAME_EXACT_RE)
  nameExact?: string;

  @IsOptional()
  @IsString()
  @Matches(UUID_RE)
  subjectUuid?: string;

  @IsOptional()
  @BoolParam()
  @IsBoolean()
  silent?: boolean;

  @IsOptional()
  @BoolParam()
  @IsBoolean()
  ipBan?: boolean;

  @IsOptional()
  @BoolParam()
  @IsBoolean()
  hidden?: boolean;

  @IsOptional()
  @IsString()
  @Matches(ISO_UTC_RE)
  from?: string;

  @IsOptional()
  @IsString()
  @Matches(ISO_UTC_RE)
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

/// Тело POST /admin/punishments/:ref/issuer-hidden.
export class HidePunishmentIssuerDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Matches(/^[^\r\n]{1,200}$/, {
    message: 'reason must be 1-200 characters of plain text on one line',
  })
  reason!: string;
}
